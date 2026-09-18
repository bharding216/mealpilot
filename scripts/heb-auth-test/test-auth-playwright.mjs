#!/usr/bin/env node
/**
 * H-E-B Auth PoC v3 — Uses ONLY captured persisted-query hashes
 *
 * Strategy: let the real browser make the requests first (capturing hashes),
 * then replay them from pure Node with extracted cookies.
 */

import { chromium } from 'playwright';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

function log(label) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('═'.repeat(60));
}

async function main() {
  console.log('\n🔬  H-E-B Auth PoC v3\n');

  const email = await ask('Enter your H-E-B email: ');

  // ── Launch browser ────────────────────────────────────────────────────

  log('PHASE 1: Browser login');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  // Capture ALL GraphQL request/response pairs
  const capturedHashes = {};
  const capturedRequests = {};

  await context.route('**/graphql**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      try {
        const body = JSON.parse(req.postData() || '{}');
        if (body.operationName) {
          const hash = body.extensions?.persistedQuery?.sha256Hash;
          if (hash) {
            capturedHashes[body.operationName] = hash;
          }
          capturedRequests[body.operationName] = {
            hash,
            variables: body.variables,
            query: body.query,
          };
          console.log(`    [captured] ${body.operationName} hash=${hash ? hash.slice(0, 16) + '...' : 'none'}`);
        }
      } catch {}
    }
    await route.continue();
  });

  const page = await context.newPage();

  // Login flow
  console.log('  Navigating to H-E-B login...');
  await page.goto('https://www.heb.com/account/sign-in', {
    waitUntil: 'networkidle', timeout: 60000,
  });

  try {
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
    await page.fill('input[type="email"]', email);
    const btn = await page.$('button[type="submit"]');
    if (btn) await btn.click();
    console.log('  ✅ Email submitted');
  } catch {
    console.log('  ⚠️  Enter email manually in browser');
  }

  await page.waitForTimeout(3000);

  // Try OTP selection
  try {
    for (const sel of ['button:has-text("email")', 'button:has-text("one-time")', 'button:has-text("code")']) {
      const el = await page.$(sel);
      if (el) { await el.click(); break; }
    }
  } catch {}

  console.log('  📧 Check your email for the OTP.');
  const otp = await ask('  Enter 6-digit OTP (or "browser"): ');

  if (/^\d{6}$/.test(otp)) {
    try {
      const inputs = await page.$$('input[name*="code"], input[type="tel"], input[inputmode="numeric"]');
      if (inputs.length >= 6) {
        for (let i = 0; i < 6; i++) await inputs[i].fill(otp[i]);
      } else {
        await page.keyboard.type(otp, { delay: 80 });
      }
      await page.waitForTimeout(500);
      const vbtn = await page.$('button[type="submit"], button:has-text("Verify"), button:has-text("Continue")');
      if (vbtn) await vbtn.click();
      console.log('  ✅ OTP submitted');
    } catch (err) {
      console.log(`  Enter OTP in browser: ${err.message}`);
    }
  }

  await ask('\n  Press Enter once logged in (heb.com homepage visible): ');
  console.log(`  URL: ${page.url()}`);

  // ── Trigger searches to capture more hashes ───────────────────────────

  log('PHASE 2: Capturing hashes by triggering browser actions');

  // Navigate to homepage to trigger cart + nav queries
  if (!page.url().startsWith('https://www.heb.com')) {
    await page.goto('https://www.heb.com', { waitUntil: 'networkidle', timeout: 30000 });
  }
  await page.waitForTimeout(3000);

  // Trigger typeahead by typing in search box
  console.log('  Triggering typeahead search...');
  try {
    const searchInput = await page.$('input[type="search"], input[placeholder*="Search"], input[aria-label*="search"], #search, [data-testid*="search"]');
    if (searchInput) {
      await searchInput.click();
      await searchInput.type('milk', { delay: 150 });
      await page.waitForTimeout(2000);
      console.log('  ✅ Typed "milk" in search box');
      // Clear it
      await searchInput.fill('');
    } else {
      console.log('  ⚠️  Could not find search input. Will try without typeahead hash.');
    }
  } catch (err) {
    console.log(`  Search input error: ${err.message}`);
  }

  // Print all captured hashes
  console.log(`\n  Captured ${Object.keys(capturedHashes).length} operation hashes:`);
  for (const [op, hash] of Object.entries(capturedHashes)) {
    console.log(`    ${op}: ${hash}`);
  }

  // ── In-browser GraphQL test using captured hash ───────────────────────

  log('PHASE 3: In-browser GraphQL test');

  const cartHash = capturedHashes['cartEstimated'];
  if (cartHash) {
    console.log(`  Using captured cartEstimated hash: ${cartHash}`);
    const result = await page.evaluate(async (hash) => {
      try {
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
        return await res.json();
      } catch (err) {
        return { error: err.message };
      }
    }, cartHash);

    console.log('  Browser cartEstimated result:');
    console.log(JSON.stringify(result, null, 2).slice(0, 2000));
  } else {
    console.log('  ⚠️  No cartEstimated hash captured. Try scrolling around heb.com to trigger it.');
  }

  // ── Extract cookies ───────────────────────────────────────────────────

  log('PHASE 4: Extracting cookies');

  const cookies = await context.cookies();
  console.log(`  ${cookies.length} cookies extracted`);

  const hebCookies = cookies
    .filter(c => c.domain === '.heb.com' || c.domain === 'www.heb.com')
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  // Show key auth cookies
  for (const c of cookies) {
    if (['sat', 'sst', 'sst.sig'].includes(c.name)) {
      console.log(`  [${c.domain}] ${c.name} = ${c.value.slice(0, 40)}... (httpOnly=${c.httpOnly})`);
    }
  }

  // Save for reference
  writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));
  writeFileSync('hashes.json', JSON.stringify(capturedHashes, null, 2));
  console.log('  Saved cookies.json and hashes.json');

  await browser.close();
  console.log('  Browser closed.');

  // ── Node-only GraphQL tests ───────────────────────────────────────────

  log('PHASE 5: Pure Node GraphQL tests (no browser)');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Origin': 'https://www.heb.com',
    'Referer': 'https://www.heb.com/',
    'apollographql-client-name': 'WebPlatform-Solar (Production)',
    'Cookie': hebCookies,
  };

  // Test each captured operation
  for (const [opName, hash] of Object.entries(capturedHashes)) {
    const variables = capturedRequests[opName]?.variables || {};

    // Skip operations that need specific variables we don't have
    if (['ShopNavigation', 'alertEntryPoint', 'ShoppingStore'].includes(opName)) {
      console.log(`  [skip] ${opName} (navigation/UI operation)`);
      continue;
    }

    console.log(`\n  [test] ${opName} (hash: ${hash.slice(0, 16)}...)`);
    console.log(`         variables: ${JSON.stringify(variables)}`);

    try {
      const res = await fetch('https://www.heb.com/graphql', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operationName: opName,
          variables,
          extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
        }),
      });

      const json = await res.json();

      if (json.errors) {
        console.log(`         ❌ ${json.errors.map(e => e.message).join(', ')}`);
      } else if (json.data) {
        const preview = JSON.stringify(json.data).slice(0, 300);
        console.log(`         ✅ Got data: ${preview}...`);
      }
    } catch (err) {
      console.log(`         ❌ Fetch error: ${err.message}`);
    }
  }

  // Also test typeahead if we have the hash
  const taHash = capturedHashes['typeaheadContent'];
  if (taHash) {
    console.log(`\n  [test] typeaheadContent for "chicken" (hash: ${taHash.slice(0, 16)}...)`);
    try {
      const res = await fetch('https://www.heb.com/graphql', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operationName: 'typeaheadContent',
          variables: { term: 'chicken', searchMode: 'MAIN_SEARCH' },
          extensions: { persistedQuery: { version: 1, sha256Hash: taHash } },
        }),
      });
      const json = await res.json();
      if (json.data?.typeaheadContent) {
        console.log('         ✅ Typeahead works!');
        console.log(`         ${JSON.stringify(json.data.typeaheadContent).slice(0, 300)}...`);
      } else {
        console.log(`         ❌ ${JSON.stringify(json).slice(0, 300)}`);
      }
    } catch (err) {
      console.log(`         ❌ ${err.message}`);
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────

  log('RESULTS');
  console.log(`  Hashes captured:     ${Object.keys(capturedHashes).length}`);
  console.log(`  Cookies extracted:   ${cookies.length} (heb.com string: ${hebCookies.length} chars)`);
  console.log(`  Key cookie (sat):    ${cookies.some(c => c.name === 'sat') ? '✅ present' : '❌ missing'}`);
  console.log(`  Key cookie (sst):    ${cookies.some(c => c.name === 'sst') ? '✅ present' : '❌ missing'}`);
  console.log(`  Key cookie (reese84):${cookies.some(c => c.name === 'reese84') ? '✅ present' : '❌ missing'}`);
  console.log('\n  Files saved:');
  console.log('    cookies.json — full cookie jar (for debugging)');
  console.log('    hashes.json  — captured persisted query hashes');
  console.log('\n  Run the Node tests again without the browser:');
  console.log('    node test-replay.mjs');
  console.log('');

  rl.close();
}

main().catch(err => {
  console.error('\n💥', err);
  rl.close();
  process.exit(1);
});
