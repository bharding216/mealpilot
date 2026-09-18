#!/usr/bin/env node
/**
 * Replay H-E-B GraphQL requests using saved cookies + hashes.
 * Run test-auth-playwright.mjs first to generate cookies.json and hashes.json.
 *
 * Usage: node test-replay.mjs
 */

import { readFileSync, existsSync } from 'node:fs';

if (!existsSync('cookies.json') || !existsSync('hashes.json')) {
  console.error('Missing cookies.json or hashes.json. Run test-auth-playwright.mjs first.');
  process.exit(1);
}

const cookies = JSON.parse(readFileSync('cookies.json', 'utf8'));
const hashes = JSON.parse(readFileSync('hashes.json', 'utf8'));

const hebCookies = cookies
  .filter(c => c.domain === '.heb.com' || c.domain === 'www.heb.com')
  .map(c => `${c.name}=${c.value}`)
  .join('; ');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Origin': 'https://www.heb.com',
  'Referer': 'https://www.heb.com/',
  'apollographql-client-name': 'WebPlatform-Solar (Production)',
  'Cookie': hebCookies,
};

console.log(`Loaded ${cookies.length} cookies, ${Object.keys(hashes).length} hashes\n`);

async function testQuery(name, opName, variables, hash) {
  console.log(`── ${name} ──`);
  try {
    const res = await fetch('https://www.heb.com/graphql', {
      method: 'POST', headers,
      body: JSON.stringify({
        operationName: opName,
        variables,
        extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
      }),
    });
    const json = await res.json();
    if (json.errors) {
      console.log(`  ❌ ${json.errors.map(e => e.message).join(', ')}`);
    } else if (json.data) {
      console.log(`  ✅ Success`);
      console.log(`  ${JSON.stringify(json.data, null, 2).slice(0, 1500)}\n`);
    }
    return json;
  } catch (err) {
    console.log(`  ❌ ${err.message}\n`);
    return null;
  }
}

async function main() {
  // Cart
  if (hashes.cartEstimated) {
    await testQuery('Cart', 'cartEstimated', { userIsLoggedIn: true }, hashes.cartEstimated);
  }

  // Typeahead
  if (hashes.typeaheadContent) {
    await testQuery('Typeahead: milk', 'typeaheadContent',
      { term: 'milk', searchMode: 'MAIN_SEARCH' }, hashes.typeaheadContent);
  }

  // Add-to-cart (dry run — just log what we'd send)
  if (hashes.cartItemV2) {
    console.log('── Add to Cart (hash available, skipping to avoid modifying real cart) ──\n');
  }

  console.log('Done. If cart returned data, the full server-side integration is viable!');
}

main();
