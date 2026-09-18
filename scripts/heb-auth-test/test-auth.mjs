#!/usr/bin/env node
/**
 * H-E-B Authentication Proof-of-Concept
 *
 * Tests whether we can reproduce the H-E-B login flow from pure Node:
 *   1. Visit the login page → obtain interactionId + cookies
 *   2. POST email (authType=password) → step 1
 *   3. POST email (authType=otp) → triggers OTP send
 *   4. Prompt user for OTP
 *   5. POST OTP verification
 *   6. Follow any redirects back to heb.com
 *   7. Make one authenticated GraphQL request (cartEstimated)
 *
 * Usage: node test-auth.mjs
 */

import { createInterface } from 'node:readline';
import { CookieJar } from 'tough-cookie';

// ─── Helpers ────────────────────────────────────────────────────────────────

const jar = new CookieJar();

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

function log(label, data) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('═'.repeat(60));
  if (data !== undefined) {
    if (typeof data === 'string') console.log(data);
    else console.log(JSON.stringify(data, null, 2));
  }
}

function logCookies(url) {
  const cookies = jar.getCookiesSync(url);
  console.log(`  Cookies for ${new URL(url).hostname}:`);
  for (const c of cookies) {
    const val = c.value.length > 60 ? c.value.slice(0, 60) + '...' : c.value;
    console.log(`    ${c.key} = ${val}  (httpOnly=${c.httpOnly})`);
  }
  if (cookies.length === 0) console.log('    (none)');
}

/** Cookie-aware fetch wrapper. Automatically sends/stores cookies. */
async function cookieFetch(url, options = {}) {
  const cookieString = jar.getCookieStringSync(url);
  const headers = { ...(options.headers || {}) };
  if (cookieString) headers['Cookie'] = cookieString;

  const res = await fetch(url, {
    ...options,
    headers,
    redirect: 'manual',
  });

  // Store Set-Cookie headers
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    try {
      jar.setCookieSync(sc, url);
    } catch {
      // tough-cookie may reject some malformed cookies
    }
  }

  return res;
}

/** Follow redirects manually so we can capture cookies at each hop. */
async function followRedirects(res, maxHops = 15) {
  let current = res;
  let hops = 0;
  while ([301, 302, 303, 307, 308].includes(current.status) && hops < maxHops) {
    const location = current.headers.get('location');
    if (!location) break;
    const nextUrl = new URL(location, current.url).href;
    console.log(`  → ${current.status} redirect to ${nextUrl.slice(0, 120)}...`);
    current = await cookieFetch(nextUrl, {
      headers: { 'User-Agent': DESKTOP_UA },
    });
    hops++;
  }
  return current;
}

/** Build multipart form data boundary + body (no external deps needed). */
function buildMultipart(fields) {
  const boundary = '----NodeFormBoundary' + Math.random().toString(36).slice(2);
  let body = '';
  for (const [key, value] of fields) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return { boundary, body };
}

function generateRequestId() {
  return `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Main Flow ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔬  H-E-B Authentication Proof-of-Concept');
  console.log('   Testing server-side login flow from Node\n');

  const email = await ask('Enter your H-E-B email: ');
  if (!email.includes('@')) {
    console.error('Invalid email');
    process.exit(1);
  }

  // ── STEP 0: Visit login entry point to get interactionId ──
  log('STEP 0: GET login page (discover interactionId)');

  let res = await cookieFetch('https://www.heb.com/account/sign-in', {
    headers: {
      'User-Agent': DESKTOP_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  res = await followRedirects(res);

  const finalUrl = res.url || res.headers.get('location') || '';
  console.log(`  Final URL: ${finalUrl}`);
  console.log(`  Status: ${res.status}`);

  // Extract interactionId from the final URL
  const interactionMatch = finalUrl.match(/\/interaction\/([^/]+)/);
  if (!interactionMatch) {
    // If we didn't get redirected, try to find it in the response body
    const html = await res.text();
    const bodyMatch = html.match(/\/interaction\/([A-Za-z0-9_-]+)/);
    if (bodyMatch) {
      console.log(`  Found interactionId in body: ${bodyMatch[1]}`);
    } else {
      console.error('\n❌  Could not find interactionId. Response details:');
      console.log(`  Status: ${res.status}`);
      console.log(`  Headers:`, Object.fromEntries(res.headers.entries()));
      console.log(`  Body (first 2000 chars):`, html.slice(0, 2000));
      process.exit(1);
    }
  }

  const interactionId = interactionMatch?.[1] ??
    finalUrl.match(/\/interaction\/([A-Za-z0-9_-]+)/)?.[1];
  console.log(`  interactionId: ${interactionId}`);

  logCookies('https://accounts.heb.com');
  logCookies('https://www.heb.com');

  // We need to also GET the actual login page to pick up any additional cookies/tokens
  log('STEP 0b: GET the login page HTML');
  const loginPageUrl = `https://accounts.heb.com/interaction/${interactionId}/login`;
  res = await cookieFetch(loginPageUrl, {
    headers: {
      'User-Agent': DESKTOP_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  res = await followRedirects(res);
  const loginHtml = await res.text();
  console.log(`  Status: ${res.status}`);
  console.log(`  Body length: ${loginHtml.length}`);

  // Try to extract the next-action hash from the page
  const actionHashMatch = loginHtml.match(/"actionId":"([a-f0-9]+)"/);
  if (actionHashMatch) {
    console.log(`  Found next-action hash: ${actionHashMatch[1]}`);
  }

  logCookies('https://accounts.heb.com');

  // ── STEP 1: POST email with authType=password ──
  log('STEP 1: POST email (authType=password, step 1)');

  const requestId = generateRequestId();
  console.log(`  requestId: ${requestId}`);

  const step1Fields = [
    ['_1_requestId', requestId],
    ['_1_step', '1'],
    ['_1_email', email],
    ['_1_authType', 'password'],
    ['_1_password', '0'],
    ['0', '[{"fieldErrors":{},"formErrors":[]},"$K1"]'],
  ];

  const { boundary: b1, body: body1 } = buildMultipart(step1Fields);

  // Build next-router-state-tree for the login page
  const stateTree1 = JSON.stringify([
    '', {
      children: [
        'interaction', {
          children: [
            ['interactionId', interactionId, 'd'], {
              children: [
                'login', {
                  children: ['__PAGE__', {}, null, null],
                }, null, null,
              ],
            }, null, null,
          ],
        }, null, null,
      ],
    }, null, null, true,
  ]);

  res = await cookieFetch(loginPageUrl, {
    method: 'POST',
    headers: {
      'User-Agent': DESKTOP_UA,
      'Content-Type': `multipart/form-data; boundary=${b1}`,
      'Accept': 'text/x-component',
      'Next-Action': '600427a14a9a92da400e0035a19ac9cf36f748a9a1',
      'Next-Router-State-Tree': encodeURIComponent(stateTree1),
      'Origin': 'https://accounts.heb.com',
      'Referer': loginPageUrl,
    },
    body: body1,
  });

  const step1Body = await res.text();
  console.log(`  Status: ${res.status}`);
  console.log(`  Response body (first 1000 chars):\n${step1Body.slice(0, 1000)}`);
  logCookies('https://accounts.heb.com');

  // ── STEP 2: POST email with authType=otp ──
  log('STEP 2: POST email (authType=otp) — triggers OTP send');

  const step2Fields = [
    ['_1_requestId', requestId],
    ['_1_step', '1'],
    ['_1_email', email],
    ['_1_authType', 'otp'],
    ['_1_password', '0'],
    ['0', '[{"formErrors":[],"fieldErrors":{}},"$K1"]'],
  ];

  const { boundary: b2, body: body2 } = buildMultipart(step2Fields);

  res = await cookieFetch(loginPageUrl, {
    method: 'POST',
    headers: {
      'User-Agent': DESKTOP_UA,
      'Content-Type': `multipart/form-data; boundary=${b2}`,
      'Accept': 'text/x-component',
      'Next-Action': '600427a14a9a92da400e0035a19ac9cf36f748a9a1',
      'Next-Router-State-Tree': encodeURIComponent(stateTree1),
      'Origin': 'https://accounts.heb.com',
      'Referer': loginPageUrl,
    },
    body: body2,
  });

  const step2Body = await res.text();
  console.log(`  Status: ${res.status}`);
  console.log(`  Response body (first 2000 chars):\n${step2Body.slice(0, 2000)}`);
  logCookies('https://accounts.heb.com');

  // Try to extract the otpId from the response
  // RSC responses often contain redirect URLs or state updates
  let otpId = null;

  // Look for an otpId/verification path in the response
  const otpIdPatterns = [
    /\/login\/([A-Za-z0-9_-]+)\/verify/,
    /"otpId"[:\s]*"([A-Za-z0-9_-]+)"/,
    /\["otpId","([A-Za-z0-9_-]+)"/,
  ];

  for (const pattern of otpIdPatterns) {
    const match = step2Body.match(pattern);
    if (match) {
      otpId = match[1];
      break;
    }
  }

  if (!otpId) {
    // Try to find it in Set-Cookie or response headers
    console.log('\n  ⚠️  Could not extract otpId from response body.');
    console.log('  Full response body:');
    console.log(step2Body);
    console.log('\n  Response headers:');
    for (const [k, v] of res.headers.entries()) {
      console.log(`    ${k}: ${v.slice(0, 120)}`);
    }

    // Ask user to provide it manually if they can see it
    otpId = await ask('\n  Enter the otpId (or press Enter to abort): ');
    if (!otpId) {
      console.error('❌  Cannot continue without otpId');
      process.exit(1);
    }
  }

  console.log(`  otpId: ${otpId}`);

  // ── STEP 3: Wait for OTP from user ──
  log('STEP 3: Waiting for OTP');
  console.log('  📧 Check your email for the H-E-B verification code.');
  const otp = await ask('  Enter the 6-digit OTP: ');

  if (!/^\d{6}$/.test(otp)) {
    console.error('OTP must be exactly 6 digits');
    process.exit(1);
  }

  // ── STEP 4: POST OTP verification ──
  log('STEP 4: POST OTP verification');

  const verifyUrl = `https://accounts.heb.com/interaction/${interactionId}/login/${otpId}/verify`;
  console.log(`  URL: ${verifyUrl}`);

  const digits = otp.split('');
  const step4Fields = [
    ['_1_requestId', requestId],
    ['_1_code_input_1', digits[0]],
    ['_1_code_input_2', digits[1]],
    ['_1_code_input_3', digits[2]],
    ['_1_code_input_4', digits[3]],
    ['_1_code_input_5', digits[4]],
    ['_1_code_input_6', digits[5]],
    ['_1_otpCode', otp],
    ['0', '[{"fieldErrors":{},"formErrors":[]},"$K1"]'],
  ];

  const { boundary: b4, body: body4 } = buildMultipart(step4Fields);

  // Build state tree for the verify page
  const stateTree4 = JSON.stringify([
    '', {
      children: [
        'interaction', {
          children: [
            ['interactionId', interactionId, 'd'], {
              children: [
                'login', {
                  children: [
                    ['otpId', otpId, 'd'], {
                      children: ['verify', {
                        children: ['__PAGE__', {}, null, null],
                      }, null, null],
                    }, null, null,
                  ],
                }, null, null,
              ],
            }, null, null,
          ],
        }, null, null,
      ],
    }, null, null, true,
  ]);

  res = await cookieFetch(verifyUrl, {
    method: 'POST',
    headers: {
      'User-Agent': DESKTOP_UA,
      'Content-Type': `multipart/form-data; boundary=${b4}`,
      'Accept': 'text/x-component',
      'Next-Action': '600b7621527f3c79020e5e6993fc4acf0d9c0e40b6',
      'Next-Router-State-Tree': encodeURIComponent(stateTree4),
      'Origin': 'https://accounts.heb.com',
      'Referer': verifyUrl,
    },
    body: body4,
  });

  const step4Body = await res.text();
  console.log(`  Status: ${res.status}`);
  console.log(`  Response body (first 2000 chars):\n${step4Body.slice(0, 2000)}`);

  logCookies('https://accounts.heb.com');

  // ── STEP 5: Follow any redirect chain back to heb.com ──
  log('STEP 5: Follow post-auth redirects');

  // The RSC response might contain a redirect URL
  const redirectMatch = step4Body.match(/https?:\/\/[^\s"',]+/g);
  if (redirectMatch) {
    console.log('  Found URLs in response:');
    for (const url of redirectMatch) {
      console.log(`    ${url.slice(0, 150)}`);
    }

    // Follow the first heb.com redirect
    const hebRedirect = redirectMatch.find(
      (u) => u.includes('heb.com') && !u.includes('accounts.heb.com')
    );
    if (hebRedirect) {
      console.log(`\n  Following redirect: ${hebRedirect.slice(0, 150)}`);
      res = await cookieFetch(hebRedirect, {
        headers: {
          'User-Agent': DESKTOP_UA,
          'Accept': 'text/html',
        },
      });
      res = await followRedirects(res);
      console.log(`  Final status: ${res.status}`);
      const redirectBody = await res.text();
      console.log(`  Body length: ${redirectBody.length}`);
    }
  }

  // Also try following the OIDC callback if the auth was through OpenID Connect
  const oidcMatch = step4Body.match(/(\/auth\/callback[^\s"']+)/);
  if (oidcMatch) {
    console.log(`\n  Found OIDC callback: ${oidcMatch[1]}`);
    const callbackUrl = `https://www.heb.com${oidcMatch[1]}`;
    res = await cookieFetch(callbackUrl, {
      headers: { 'User-Agent': DESKTOP_UA, 'Accept': 'text/html' },
    });
    res = await followRedirects(res);
    console.log(`  Callback status: ${res.status}`);
  }

  log('Cookie state after authentication');
  logCookies('https://accounts.heb.com');
  logCookies('https://www.heb.com');

  // List ALL cookies across all domains
  console.log('\n  All cookie jar contents:');
  const allCookies = jar.toJSON();
  for (const c of allCookies.cookies) {
    const val = c.value?.length > 50 ? c.value.slice(0, 50) + '...' : c.value;
    console.log(`    [${c.domain}] ${c.key} = ${val}  (httpOnly=${c.httpOnly ?? false})`);
  }

  // ── STEP 6: Test an authenticated GraphQL request ──
  log('STEP 6: Test authenticated GraphQL request (cartEstimated)');

  const graphqlBody = JSON.stringify({
    operationName: 'cartEstimated',
    variables: { userIsLoggedIn: true },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: '0784bca75357ce90cf0fe444091a3b4a1b04339bf46ffca503f4e2e34ff5c566',
      },
    },
  });

  res = await cookieFetch('https://www.heb.com/graphql', {
    method: 'POST',
    headers: {
      'User-Agent': DESKTOP_UA,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'https://www.heb.com',
      'Referer': 'https://www.heb.com/',
      'apollographql-client-name': 'WebPlatform-Solar (Production)',
    },
    body: graphqlBody,
  });

  // Follow redirects if any
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    res = await followRedirects(res);
  }

  const graphqlResponse = await res.text();
  console.log(`  Status: ${res.status}`);
  console.log(`  Response headers:`);
  for (const [k, v] of res.headers.entries()) {
    if (['content-type', 'set-cookie', 'x-cdn', 'cache-control'].includes(k)) {
      console.log(`    ${k}: ${v.slice(0, 120)}`);
    }
  }

  try {
    const parsed = JSON.parse(graphqlResponse);
    console.log(`\n  GraphQL response (formatted):`);
    console.log(JSON.stringify(parsed, null, 2).slice(0, 3000));

    if (parsed.data?.cartV2) {
      console.log('\n✅  SUCCESS! Authenticated GraphQL request worked!');
      console.log('   The server-side H-E-B login flow is viable.');
      const cart = parsed.data.cartV2;
      if (cart.fulfillment?.store) {
        console.log(`   Store: ${cart.fulfillment.store.name} (${cart.fulfillment.store.id})`);
      }
      console.log(`   Cart items: ${cart.items?.length ?? 0}`);
    } else if (parsed.errors) {
      console.log('\n⚠️  GraphQL returned errors:');
      for (const err of parsed.errors) {
        console.log(`   - ${err.message}`);
      }
    } else {
      console.log('\n⚠️  Got a response but no cart data. May need different cookies.');
    }
  } catch {
    console.log(`\n  Raw response (first 2000 chars):\n${graphqlResponse.slice(0, 2000)}`);
    if (res.status === 200) {
      console.log('\n⚠️  Got 200 but response is not JSON.');
    } else {
      console.log(`\n❌  Request failed with status ${res.status}`);
    }
  }

  log('DONE');
  console.log('  Review the output above to determine if the flow worked.');
  console.log('  Key questions:');
  console.log('    1. Did we get _uad and _dvcid cookies after OTP verify?');
  console.log('    2. Did we get a sat cookie on heb.com after redirects?');
  console.log('    3. Did the GraphQL request return cart data?');
  console.log('');

  rl.close();
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  rl.close();
  process.exit(1);
});
