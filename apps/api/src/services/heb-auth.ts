/**
 * Server-side H-E-B authentication via Playwright.
 *
 * Flow:
 *   1. initLogin(email)   → Launches headless Chromium, navigates to HEB login,
 *                            submits email, triggers OTP, returns a loginId.
 *   2. verifyOtp(loginId, otp) → Submits the OTP in the waiting browser,
 *                                 extracts all cookies + hashes, returns them.
 *
 * The browser instance is kept alive between steps (stored in a Map keyed by loginId).
 * After verification (or timeout), the browser is closed.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

interface PendingLogin {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  email: string;
  capturedHashes: Record<string, string>;
  createdAt: number;
  timeout: ReturnType<typeof setTimeout>;
}

interface LoginResult {
  cookies: string;
  hashes: Record<string, string>;
  storeId: string | null;
  storeName: string | null;
}

const pendingLogins = new Map<string, PendingLogin>();

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes to enter OTP

function generateLoginId(): string {
  return `heb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Step 1: Start the H-E-B login flow.
 * Launches a headless browser, navigates to heb.com/account/sign-in,
 * enters the email, and triggers the OTP.
 */
export async function initLogin(email: string): Promise<{ loginId: string }> {
  const loginId = generateLoginId();

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const capturedHashes: Record<string, string> = {};

  // Intercept GraphQL to capture persisted query hashes
  await context.route('**/graphql**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      try {
        const body = JSON.parse(req.postData() || '{}');
        if (body.operationName && body.extensions?.persistedQuery?.sha256Hash) {
          capturedHashes[body.operationName] = body.extensions.persistedQuery.sha256Hash;
        }
      } catch {}
    }
    await route.continue();
  });

  const page = await context.newPage();

  try {
    // Navigate to login
    await page.goto('https://www.heb.com/account/sign-in', {
      waitUntil: 'networkidle',
      timeout: 45000,
    });

    // Wait for and fill email
    await page.waitForSelector('input[type="email"]', { timeout: 20000 });
    await page.fill('input[type="email"]', email);

    // Submit email
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await page.waitForTimeout(3000);

    // Try to select OTP if there's a choice
    for (const sel of [
      'button:has-text("email")',
      'button:has-text("one-time")',
      'button:has-text("code")',
      'button:has-text("verification")',
    ]) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await page.waitForTimeout(2000);
        break;
      }
    }

    // Auto-cleanup after timeout
    const timeout = setTimeout(() => {
      const pending = pendingLogins.get(loginId);
      if (pending) {
        pending.browser.close().catch(() => {});
        pendingLogins.delete(loginId);
      }
    }, LOGIN_TIMEOUT_MS);

    pendingLogins.set(loginId, {
      browser,
      context,
      page,
      email,
      capturedHashes,
      createdAt: Date.now(),
      timeout,
    });

    return { loginId };
  } catch (err) {
    await browser.close().catch(() => {});
    throw new Error(`Failed to initiate H-E-B login: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

/**
 * Step 2: Submit the OTP and extract authenticated cookies.
 */
export async function verifyOtp(loginId: string, otp: string): Promise<LoginResult> {
  const pending = pendingLogins.get(loginId);
  if (!pending) {
    throw new Error('Login session not found or expired. Please start over.');
  }

  clearTimeout(pending.timeout);
  const { browser, context, page, capturedHashes } = pending;

  try {
    // Fill OTP digits
    const codeInputs = await page.$$('input[name*="code"], input[type="tel"], input[inputmode="numeric"]');
    if (codeInputs.length >= 6) {
      for (let i = 0; i < 6; i++) {
        await codeInputs[i].fill(otp[i]);
      }
    } else if (codeInputs.length === 1) {
      await codeInputs[0].fill(otp);
    } else {
      await page.keyboard.type(otp, { delay: 60 });
    }

    // Submit OTP
    await page.waitForTimeout(500);
    const verifyBtn = await page.$(
      'button[type="submit"], button:has-text("Verify"), button:has-text("Continue")'
    );
    if (verifyBtn) await verifyBtn.click();

    // Wait for redirect back to heb.com
    await page.waitForURL('**/heb.com/**', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Navigate to heb.com to ensure we get all cookies + trigger cart hash
    if (!page.url().includes('www.heb.com')) {
      await page.goto('https://www.heb.com', { waitUntil: 'networkidle', timeout: 20000 });
    }
    await page.waitForTimeout(2000);

    // Try to trigger a typeahead to capture that hash
    try {
      const searchInput = await page.$(
        'input[type="search"], input[placeholder*="Search"], input[aria-label*="search"]'
      );
      if (searchInput) {
        await searchInput.click();
        await searchInput.type('milk', { delay: 100 });
        await page.waitForTimeout(2000);
        await searchInput.fill('');
      }
    } catch {}

    // Extract cookies
    const allCookies = await context.cookies();
    const hebCookies = allCookies
      .filter((c) => c.domain === '.heb.com' || c.domain === 'www.heb.com')
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    if (!allCookies.some((c) => c.name === 'sat')) {
      throw new Error('Authentication failed: sat cookie not found. OTP may be incorrect.');
    }

    // Try to get store info from the cart (via in-browser fetch)
    let storeId: string | null = null;
    let storeName: string | null = null;

    const cartHash = capturedHashes['cartEstimated'];
    if (cartHash) {
      try {
        const cartResult = await page.evaluate(async (hash: string) => {
          const res = await fetch('/graphql', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'apollographql-client-name': 'WebPlatform-Solar (Production)',
            },
            body: JSON.stringify({
              operationName: 'cartEstimated',
              variables: { userIsLoggedIn: true },
              extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
            }),
          });
          return res.json();
        }, cartHash);

        const store = cartResult?.data?.cartV2?.fulfillment?.store;
        if (store) {
          storeId = store.id;
          storeName = store.name;
        }
      } catch {}
    }

    return {
      cookies: hebCookies,
      hashes: capturedHashes,
      storeId,
      storeName,
    };
  } finally {
    pendingLogins.delete(loginId);
    await browser.close().catch(() => {});
  }
}

/**
 * Cancel a pending login (cleanup).
 */
export function cancelLogin(loginId: string): void {
  const pending = pendingLogins.get(loginId);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.browser.close().catch(() => {});
    pendingLogins.delete(loginId);
  }
}

/**
 * Check how many pending logins are active (for monitoring).
 */
export function getPendingLoginCount(): number {
  return pendingLogins.size;
}
