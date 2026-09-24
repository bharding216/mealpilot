import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

// ─── Types ───

export interface HebStore {
  storeId: string;
  name: string;
}

export interface HebProduct {
  productId: string;
  skuId: string;
  name: string;
  brand: string | null;
  size: string | null;
  price: number | null;
  unitPrice: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  inStock: boolean;
  category: string | null;
}

export interface HebCartItem {
  productId: string;
  skuId: string;
  name: string;
  quantity: number;
  price: number | null;
  imageUrl: string | null;
}

export interface HebCart {
  id: string;
  items: HebCartItem[];
  estimatedTotal: number | null;
  itemCount: number;
  store: {
    storeId: string;
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  } | null;
}

interface AuthResult {
  authenticated: boolean;
  store: HebStore | null;
  itemCount: number;
}

interface HebBridgeContextType {
  isReady: boolean;
  isAuthenticated: boolean;
  store: HebStore | null;
  checkAuth: () => Promise<AuthResult>;
  searchProducts: (query: string, limit?: number) => Promise<{ products: HebProduct[]; raw: string | null }>;
  addToCart: (productId: string, skuId: string, quantity?: number) => Promise<HebCart>;
  updateCartItem: (productId: string, skuId: string, quantity: number) => Promise<HebCart>;
  removeFromCart: (productId: string, skuId: string) => Promise<HebCart>;
  getCart: () => Promise<HebCart>;
  reload: () => void;
}

const HebBridgeContext = createContext<HebBridgeContextType | null>(null);

export function useHebBridge() {
  const ctx = useContext(HebBridgeContext);
  if (!ctx) throw new Error('useHebBridge must be used within HebBridgeProvider');
  return ctx;
}

// ─── Bridge JavaScript (runs inside the WebView on heb.com) ───

const BRIDGE_JS = `
(function() {
  if (window.__hebBridgeInstalled) return;
  window.__hebBridgeInstalled = true;

  var hashes = {
    typeaheadContent: '2c4ce4e9058185bc75dc3c24f3904e2c60cf7f15a7c316e6688dd7d7a8a22531',
    cartItemV2: 'f22a250636a883b5d3e3664d78c264fb6d3799e51c147da92bab210410568b49',
    cartEstimated: 'c14a956d6d675f23e63f87511bf2ce03573e2f9de29db226dadb5dca9063d3f7',
  };

  var origFetch = window.fetch.bind(window);
  window.fetch = function() {
    var args = arguments;
    var result = origFetch.apply(this, args);
    try {
      var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
      if (url && url.indexOf('/graphql') !== -1 && args[1] && args[1].body) {
        var body = JSON.parse(args[1].body);
        if (body.operationName && body.extensions && body.extensions.persistedQuery) {
          hashes[body.operationName] = body.extensions.persistedQuery.sha256Hash;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'hash_captured',
              operation: body.operationName,
              hash: body.extensions.persistedQuery.sha256Hash,
            }));
          }
        }
      }
    } catch(e) {}
    return result;
  };

  function gql(opName, vars, hash) {
    return origFetch('/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'apollographql-client-name': 'WebPlatform-Solar (Production)',
      },
      body: JSON.stringify({
        operationName: opName,
        variables: vars,
        extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
      }),
    }).then(function(r) { return r.json(); });
  }

  // Auto-refresh stale hashes by scanning HEB's JS bundles
  var hashRefreshPromise = null;
  function refreshHashes() {
    if (hashRefreshPromise) return hashRefreshPromise;
    hashRefreshPromise = origFetch('/', { credentials: 'include' })
      .then(function(r) { return r.text(); })
      .then(function(html) {
        // Find ALL script URLs (not just _next/static)
        var scriptMatches = html.match(/src="([^"]+\\.js[^"]*)"/g) || [];
        var urls = scriptMatches.map(function(m) {
          var u = m.match(/src="([^"]+)"/);
          return u ? u[1] : null;
        }).filter(Boolean);

        // Also check inline scripts
        var inlineScripts = html.match(/<script[^>]*>([\\s\\S]{100,}?)<\\/script>/g) || [];
        var inlineCode = inlineScripts.join('\\n');

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'hash_captured',
            operation: 'refreshHashes:scripts',
            hash: urls.length + ' external + ' + inlineScripts.length + ' inline scripts found',
          }));
        }

        return Promise.all(urls.slice(0, 20).map(function(url) {
          return origFetch(url).then(function(r) { return r.text(); }).catch(function() { return ''; });
        })).then(function(bundles) {
          return inlineCode + '\\n' + bundles.join('\\n');
        });
      })
      .then(function(code) {
        var found = [];
        var ops = ['cartItemV2', 'typeaheadContent', 'cartEstimated'];

        // Strategy 1: Find a known hash and look for the hash map around it
        var knownHash = 'c14a956d6d675f23'; // cartEstimated prefix
        var knownIdx = code.indexOf(knownHash);
        if (knownIdx !== -1) {
          // Get a wide window around the known hash - the mapping should be nearby
          var mapContext = code.substring(Math.max(0, knownIdx - 2000), knownIdx + 2000);
          // Log the area around the known hash for debugging
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'hash_captured',
              operation: 'refreshHashes:knownHashContext',
              hash: mapContext.slice(0, 300),
            }));
          }
          // Search for all 64-char hex hashes in this region
          var allHashes = mapContext.match(/[a-f0-9]{64}/g) || [];
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'hash_captured',
              operation: 'refreshHashes:nearbyHashes',
              hash: allHashes.length + ' hashes: ' + allHashes.map(function(h) { return h.slice(0, 12); }).join(', '),
            }));
          }
        }

        // Strategy 2: Search for each operation name and grab wider context
        for (var i = 0; i < ops.length; i++) {
          var op = ops[i];
          var searchFrom = 0;
          var contexts = [];
          // Find ALL occurrences
          while (true) {
            var idx = code.indexOf(op, searchFrom);
            if (idx === -1) break;
            contexts.push(code.substring(Math.max(0, idx - 100), idx + 500));
            searchFrom = idx + op.length;
            if (contexts.length >= 5) break;
          }

          for (var ci = 0; ci < contexts.length; ci++) {
            var ctx = contexts[ci];
            var hashMatch = ctx.match(/[a-f0-9]{64}/);
            if (hashMatch) {
              hashes[op] = hashMatch[0];
              found.push(op + '=' + hashMatch[0].slice(0, 12) + '...');
              break;
            }
          }
        }
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'hash_captured',
            operation: 'refreshHashes:result',
            hash: found.length > 0 ? found.join(', ') : 'none found in code (' + code.length + ' chars)',
          }));
        }
      })
      .catch(function(e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'hash_captured',
            operation: 'refreshHashes:error',
            hash: e.message || 'unknown error',
          }));
        }
      })
      .finally(function() { hashRefreshPromise = null; });
    return hashRefreshPromise;
  }

  // GraphQL call with auto-retry on stale hash
  function gqlWithRetry(opName, vars) {
    return gql(opName, vars, hashes[opName])
      .then(function(json) {
        if (json.errors && json.errors.length === 1 &&
            json.errors[0].extensions && json.errors[0].extensions.code === 'PERSISTED_QUERY_NOT_FOUND') {
          // Hash is stale — try to capture it via iframe
          return captureHashViaIframe(opName).then(function(found) {
            if (found) {
              return gql(opName, vars, hashes[opName]);
            }
            // If iframe approach failed, throw descriptive error
            throw new Error('PERSISTED_QUERY_NOT_FOUND: Hash for ' + opName + ' is stale. Try adding an item on heb.com first.');
          });
        }
        return json;
      });
  }

  // Capture a mutation hash by loading a product page in a same-origin iframe
  // and clicking "Add to cart" to trigger the mutation
  function captureHashViaIframe(targetOp) {
    return new Promise(function(resolve) {
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
      iframe.src = '/search?q=milk';

      var cleanup = function() {
        try { document.body.removeChild(iframe); } catch(e) {}
      };

      var timeout = setTimeout(function() {
        cleanup();
        resolve(false);
      }, 20000);

      iframe.onload = function() {
        try {
          var iWin = iframe.contentWindow;
          var iFetch = iWin.fetch.bind(iWin);

          // Intercept fetch in the iframe to capture hashes
          iWin.fetch = function() {
            var args = arguments;
            try {
              var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
              if (url && url.indexOf('/graphql') !== -1 && args[1] && args[1].body) {
                var body = JSON.parse(args[1].body);
                if (body.operationName && body.extensions && body.extensions.persistedQuery) {
                  hashes[body.operationName] = body.extensions.persistedQuery.sha256Hash;
                  if (body.operationName === targetOp) {
                    clearTimeout(timeout);
                    setTimeout(function() { cleanup(); resolve(true); }, 1000);
                  }
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'hash_captured',
                      operation: 'iframe:' + body.operationName,
                      hash: body.extensions.persistedQuery.sha256Hash.slice(0, 16) + '...',
                    }));
                  }
                }
              }
            } catch(e) {}
            return iFetch.apply(this, args);
          };

          // Wait for the search page JS to initialize, then click add-to-cart
          setTimeout(function() {
            try {
              var iDoc = iframe.contentDocument;
              // Try multiple selectors for the add-to-cart button
              var selectors = [
                'button[data-qe-id="addToCart"]',
                'button[data-component="button"][class*="AddToCart"]',
                'button[aria-label*="Add to cart"]',
                'button[aria-label*="Add to Cart"]',
                '[class*="AddToCartButton"] button',
                '[class*="AddByQuantity"] button',
              ];
              var btn = null;
              for (var si = 0; si < selectors.length; si++) {
                btn = iDoc.querySelector(selectors[si]);
                if (btn) break;
              }

              if (btn) {
                btn.click();
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'hash_captured',
                    operation: 'iframe:clickedAddToCart',
                    hash: 'button found and clicked',
                  }));
                }
              } else {
                // Search ALL elements for add-to-cart patterns
                var allEls = iDoc.querySelectorAll('button, [role="button"], [onclick], [data-testid]');
                var cartRelated = [];
                for (var ei = 0; ei < allEls.length; ei++) {
                  var el = allEls[ei];
                  var txt = (el.textContent || '').trim().toLowerCase();
                  var aria = (el.getAttribute('aria-label') || '').toLowerCase();
                  var testId = el.getAttribute('data-testid') || el.getAttribute('data-qe-id') || '';
                  var cls = el.className || '';
                  var combined = txt + ' ' + aria + ' ' + testId + ' ' + cls;
                  if (combined.match(/add|cart|plus|qty|quantity/i)) {
                    cartRelated.push({
                      tag: el.tagName,
                      text: txt.slice(0, 30),
                      aria: aria.slice(0, 30),
                      testId: testId.slice(0, 30),
                      cls: (typeof cls === 'string' ? cls : '').slice(0, 50),
                    });
                  }
                }
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'hash_captured',
                    operation: 'iframe:cartButtons',
                    hash: cartRelated.length + ' cart-related: ' + JSON.stringify(cartRelated.slice(0, 5)).slice(0, 400),
                  }));
                }

                // Try clicking the first cart-related element
                if (cartRelated.length > 0) {
                  var targetEl = null;
                  for (var ci2 = 0; ci2 < allEls.length; ci2++) {
                    var el2 = allEls[ci2];
                    var combined2 = ((el2.textContent || '') + ' ' + (el2.getAttribute('aria-label') || '') + ' ' + (el2.getAttribute('data-testid') || '')).toLowerCase();
                    if (combined2.match(/add.*(cart|to cart)/i) || combined2.match(/cart.*add/i)) {
                      targetEl = el2;
                      break;
                    }
                  }
                  if (!targetEl) {
                    // Try any element with "add" in it
                    for (var ci3 = 0; ci3 < allEls.length; ci3++) {
                      var el3 = allEls[ci3];
                      var combined3 = ((el3.textContent || '') + ' ' + (el3.getAttribute('aria-label') || '')).toLowerCase();
                      if (combined3.match(/add to cart/i)) {
                        targetEl = el3;
                        break;
                      }
                    }
                  }
                  if (targetEl) {
                    targetEl.click();
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'hash_captured',
                        operation: 'iframe:clickedFallback',
                        hash: targetEl.tagName + ': ' + (targetEl.textContent || '').trim().slice(0, 50),
                      }));
                    }
                    // Wait for the mutation
                    setTimeout(function() {
                      clearTimeout(timeout);
                      cleanup();
                      resolve(!!hashes.cartItemV2 && hashes.cartItemV2 !== 'f22a250636a883b5d3e3664d78c264fb6d3799e51c147da92bab210410568b49');
                    }, 3000);
                    return;
                  }
                }

                clearTimeout(timeout);
                cleanup();
                resolve(false);
              }
            } catch(e) {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'hash_captured',
                  operation: 'iframe:error',
                  hash: e.message,
                }));
              }
              clearTimeout(timeout);
              cleanup();
              resolve(false);
            }
          }, 5000);
        } catch(e) {
          clearTimeout(timeout);
          cleanup();
          resolve(false);
        }
      };

      iframe.onerror = function() {
        clearTimeout(timeout);
        cleanup();
        resolve(false);
      };

      document.body.appendChild(iframe);
    });
  }

  function parseProduct(p) {
    if (!p) return null;
    return {
      productId: p.productId || p.id || '',
      skuId: p.skuId || p.sku || '',
      name: p.description || p.name || p.decodedDisplayName || '',
      brand: (p.brand && typeof p.brand === 'object' ? p.brand.name : p.brand) || null,
      size: p.unitSize || null,
      price: (p.price && (p.price.regular != null ? p.price.regular : p.price.sale)) || null,
      unitPrice: (p.price && p.price.unitPrice) || null,
      imageUrl: (p.image && p.image.url) || null,
      productUrl: null,
      inStock: !(p.inventory && p.inventory.inStock === false),
      category: null,
    };
  }

  function parseCart(cart) {
    if (!cart) return { id: '', items: [], estimatedTotal: null, itemCount: 0, store: null };
    var items = (cart.items || []).map(function(item) {
      var prod = item.product || {};
      var firstSku = prod.SKUs && prod.SKUs.length > 0 ? prod.SKUs[0] : null;
      return {
        productId: item.productId || prod.id || '',
        skuId: item.skuId || (firstSku && firstSku.id) || '',
        name: item.description || prod.decodedDisplayName || prod.displayName || prod.fullDisplayName || '',
        quantity: item.quantity || 0,
        price: (item.itemPrice && ((item.itemPrice.salePrice && item.itemPrice.salePrice.amount) || (item.itemPrice.listPrice && item.itemPrice.listPrice.amount))) || item.price || null,
        imageUrl: prod.thumbnailImageUrl || (item.image && item.image.url) || null,
      };
    });
    var store = cart.fulfillment && cart.fulfillment.store;
    var storeAddr = store && store.address;
    return {
      id: cart.id || '',
      items: items,
      estimatedTotal: (cart.price && cart.price.preTaxTotal && cart.price.preTaxTotal.amount) || null,
      itemCount: (cart.itemCount && cart.itemCount.total) || items.length,
      store: store ? {
        storeId: store.id,
        name: store.name,
        address: (storeAddr && storeAddr.addressOne) || '',
        city: (storeAddr && storeAddr.city) || '',
        state: (storeAddr && storeAddr.state) || '',
        zip: (storeAddr && storeAddr.zipCode) || '',
      } : null,
    };
  }

  window.__hebBridge = {
    hashes: hashes,
    execute: function(id, action, params) {
      var p;
      try {
        switch(action) {
          case 'checkAuth':
            p = gqlWithRetry('cartEstimated', { userIsLoggedIn: true })
              .then(function(json) {
                if (json.errors) throw new Error(json.errors[0].message || 'Auth check failed');
                var cart = json.data && json.data.cartV2;
                var store = cart && cart.fulfillment && cart.fulfillment.store;
                return {
                  authenticated: true,
                  store: store ? { storeId: store.id, name: store.name } : null,
                  itemCount: (cart && cart.itemCount && cart.itemCount.total) || 0,
                };
              });
            break;
          case 'searchProducts':
            p = origFetch('/search?q=' + encodeURIComponent(params.query), {
              credentials: 'include',
              headers: { 'Accept': 'text/html' },
            })
            .then(function(r) { return r.text(); })
            .then(function(html) {
              var match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\\s\\S]*?)<\\/script>/);
              if (!match) {
                return { products: [], raw: 'No __NEXT_DATA__ found (page length=' + html.length + ')' };
              }
              var nextData;
              try { nextData = JSON.parse(match[1]); } catch(e) {
                return { products: [], raw: 'Failed to parse __NEXT_DATA__: ' + e.message };
              }

              var pageProps = nextData.props && nextData.props.pageProps;
              if (!pageProps) {
                return { products: [], raw: 'No pageProps found' };
              }

              // Find the searchGridV2 visual component
              var layout = pageProps.layout;
              var searchGrid = null;
              if (layout && layout.visualComponents) {
                for (var ci = 0; ci < layout.visualComponents.length; ci++) {
                  var vc = layout.visualComponents[ci];
                  if (vc && (vc.type === 'searchGridV2' || vc.__typename === 'SearchGridV2')) {
                    searchGrid = vc;
                    break;
                  }
                }
              }

              if (!searchGrid) {
                return { products: [], raw: 'No searchGridV2 found. Components: ' + (layout.visualComponents || []).map(function(c) { return c.type; }).join(', ') };
              }

              // Find products in the search grid
              var productList = searchGrid.products || searchGrid.items || searchGrid.results || searchGrid.productList;

              if (!productList) {
                // Log all keys of the searchGrid to find products
                var gridKeys = Object.keys(searchGrid).join(', ');
                return { products: [], raw: 'searchGridV2 keys: [' + gridKeys + ']' };
              }

              if (!Array.isArray(productList)) {
                return { products: [], raw: 'productList is not array: ' + typeof productList };
              }

              var products = [];
              for (var i = 0; i < productList.length && products.length < (params.limit || 5); i++) {
                var p = productList[i];
                if (!p) continue;
                var firstSku = p.SKUs && p.SKUs.length > 0 ? p.SKUs[0] : null;
                products.push({
                  productId: p.productId || p.id || p.prod_id || '',
                  skuId: p.skuId || (firstSku && firstSku.id) || p.sku || p.sku_id || '',
                  name: p.description || p.decodedDisplayName || p.displayName || p.name || '',
                  brand: (p.brand && typeof p.brand === 'object' ? p.brand.name : p.brand) || null,
                  size: (firstSku && firstSku.customerFriendlySize) || p.unitSize || p.size || null,
                  price: (firstSku && firstSku.contextPrices && firstSku.contextPrices[0] && firstSku.contextPrices[0].listPrice && firstSku.contextPrices[0].listPrice.amount) || (p.price && (p.price.regular != null ? p.price.regular : p.price.sale)) || p.listPrice || null,
                  unitPrice: (p.price && p.price.unitPrice) || null,
                  imageUrl: (p.productImageUrls && p.productImageUrls.length > 0 && p.productImageUrls[0].url) || (p.image && p.image.url) || p.imageUrl || p.thumbnailImageUrl || null,
                  productUrl: p.productPageURL || p.productUrl || p.url || null,
                  inStock: p.inStock !== false && !(p.inventory && p.inventory.inventoryState === 'OUT_OF_STOCK'),
                  category: (p.productCategory && p.productCategory.name) || p.category || null,
                });
              }

              if (products.length === 0 && productList.length > 0) {
                return { products: [], raw: 'Array has ' + productList.length + ' items but parsing yielded 0. Sample keys: [' + Object.keys(productList[0]).join(', ') + ']. Sample: ' + JSON.stringify(productList[0]).slice(0, 800) };
              }
              // Log first product's raw keys for debugging
              if (productList.length > 0 && window.ReactNativeWebView) {
                var sample = productList[0];
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'debug_cart',
                  operation: 'searchProducts:rawKeys',
                  dataKeys: Object.keys(sample).join(', '),
                  cartKeys: 'productId=' + sample.productId + ' skuId=' + sample.skuId + ' id=' + sample.id + ' sku=' + sample.sku,
                  rawSample: JSON.stringify(sample).slice(0, 1500),
                }));
              }
              return { products: products, raw: null };
            })
            .catch(function(err) {
              return { products: [], raw: 'Fetch error: ' + err.message };
            });
            break;
          case 'addToCart':
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'debug_cart',
                operation: 'addToCart:params',
                dataKeys: 'productId=' + params.productId + ' skuId=' + params.skuId + ' qty=' + (params.quantity || 1),
                cartKeys: '',
                rawSample: '',
              }));
            }
            p = gqlWithRetry('cartItemV2', {
              userIsLoggedIn: true,
              productId: params.productId,
              skuId: params.skuId,
              quantity: params.quantity || 1,
            })
              .then(function(json) {
                if (json.errors) throw new Error(json.errors[0].message || 'Cart operation failed');
                var rawCart = json.data && json.data.addItemToCartV2;
                var typename = rawCart && rawCart.__typename;
                // Handle error union type
                if (typename === 'AddItemToCartV2Error') {
                  throw new Error(rawCart.message || 'Failed to add item to cart');
                }
                return parseCart(rawCart);
              });
            break;
          case 'updateCartItem':
            p = gqlWithRetry('cartItemV2', {
              userIsLoggedIn: true,
              productId: params.productId,
              skuId: params.skuId,
              quantity: params.quantity,
            })
              .then(function(json) {
                if (json.errors) throw new Error(json.errors[0].message || 'Cart operation failed');
                var rawCart = json.data && (json.data.addItemToCartV2 || json.data.updateCartItemV2);
                var typename = rawCart && rawCart.__typename;
                if (typename === 'AddItemToCartV2Error' || typename === 'UpdateCartItemV2Error') {
                  throw new Error(rawCart.message || 'Failed to update cart item');
                }
                return parseCart(rawCart);
              });
            break;
          case 'removeFromCart':
            p = gqlWithRetry('cartItemV2', {
              userIsLoggedIn: true,
              productId: params.productId,
              skuId: params.skuId,
              quantity: 0,
            })
              .then(function(json) {
                if (json.errors) throw new Error(json.errors[0].message || 'Cart operation failed');
                var rawCart = json.data && (json.data.addItemToCartV2 || json.data.removeItemFromCartV2 || json.data.deleteCartItemV2);
                var typename = rawCart && rawCart.__typename;
                if (typename && typename.indexOf('Error') !== -1) {
                  throw new Error(rawCart.message || 'Failed to remove cart item');
                }
                // If the mutation doesn't return cart data, fetch it
                if (!rawCart || !rawCart.items) {
                  return gqlWithRetry('cartEstimated', { userIsLoggedIn: true })
                    .then(function(cartJson) {
                      return parseCart(cartJson.data && cartJson.data.cartV2);
                    });
                }
                return parseCart(rawCart);
              });
            break;
          case 'getCart':
            p = gqlWithRetry('cartEstimated', { userIsLoggedIn: true })
              .then(function(json) {
                if (json.errors) throw new Error(json.errors[0].message || 'Failed to get cart');
                var rawCart = json.data && json.data.cartV2;
                var rawItems = rawCart && rawCart.items;
                var firstItem = rawItems && rawItems.length > 0 ? rawItems[0] : null;
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'debug_cart',
                    operation: 'getCart',
                    dataKeys: 'itemCount=' + JSON.stringify(rawCart && rawCart.itemCount) + ' items.length=' + (rawItems ? rawItems.length : 0),
                    cartKeys: rawCart ? Object.keys(rawCart).join(', ') : 'no cart obj',
                    rawSample: firstItem ? JSON.stringify(firstItem).slice(0, 2000) : 'no items',
                  }));
                }
                return parseCart(rawCart);
              });
            break;
          default:
            p = Promise.reject(new Error('Unknown action: ' + action));
        }
      } catch(e) {
        p = Promise.reject(e);
      }

      p.then(function(result) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, result: result }));
      }).catch(function(err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, error: err.message || String(err) }));
      });
    }
  };

  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bridge_ready' }));
})();
true;
`;

// ─── Provider Component ───

const COMMAND_TIMEOUT_MS = 30_000;

interface PendingCallback {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function HebBridgeProvider({ children }: { children: React.ReactNode }) {
  const webViewRef = useRef<WebView>(null);
  const isReadyRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [store, setStore] = useState<HebStore | null>(null);

  const nextIdRef = useRef(0);
  const callbacksRef = useRef(new Map<string, PendingCallback>());
  const queueRef = useRef<Array<() => void>>([]);

  const executeJS = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js);
  }, []);

  const sendCommand = useCallback((action: string, params: Record<string, unknown> = {}): Promise<any> => {
    return new Promise((resolve, reject) => {
      const id = `cmd_${nextIdRef.current++}`;

      const timer = setTimeout(() => {
        const cb = callbacksRef.current.get(id);
        if (cb) {
          cb.reject(new Error(`Bridge command '${action}' timed out`));
          callbacksRef.current.delete(id);
        }
      }, COMMAND_TIMEOUT_MS);

      callbacksRef.current.set(id, { resolve, reject, timer });

      const run = () => {
        const escaped = JSON.stringify(params);
        executeJS(
          `window.__hebBridge.execute(${JSON.stringify(id)}, ${JSON.stringify(action)}, ${escaped}); true;`
        );
      };

      if (isReadyRef.current) {
        run();
      } else {
        queueRef.current.push(run);
      }
    });
  }, [executeJS]);

  const flushQueue = useCallback(() => {
    const pending = queueRef.current;
    queueRef.current = [];
    for (const fn of pending) fn();
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[HebBridge msg]', data.type ?? data.id ?? 'unknown', data.error ? `ERROR: ${data.error}` : 'ok');

      if (data.type === 'bridge_ready') {
        isReadyRef.current = true;
        setIsReady(true);
        flushQueue();
        return;
      }

      if (data.type === 'hash_captured') {
        console.log('[HebBridge hash]', data.operation, data.hash?.slice(0, 16) + '...');
        return;
      }

      if (data.type === 'debug_cart') {
        console.log('[HebBridge CART DEBUG]', data.operation);
        console.log('  data keys:', data.dataKeys);
        console.log('  cart keys:', data.cartKeys);
        console.log('  raw sample:', data.rawSample);
        return;
      }

      const cb = callbacksRef.current.get(data.id);
      if (cb) {
        clearTimeout(cb.timer);
        if (data.error) {
          cb.reject(new Error(data.error));
        } else {
          cb.resolve(data.result);
        }
        callbacksRef.current.delete(data.id);
      }
    } catch {
      // Ignore unparseable messages
    }
  }, [flushQueue]);

  const handleLoadEnd = useCallback(() => {
    executeJS(BRIDGE_JS);
  }, [executeJS]);

  // Auto-check auth once the bridge is ready so isAuthenticated is always current
  useEffect(() => {
    if (isReady) {
      checkAuthRef.current().catch(() => {});
    }
  }, [isReady]);

  // ─── Public API ───

  const checkAuth = useCallback(async (): Promise<AuthResult> => {
    try {
      const result = await sendCommand('checkAuth');
      setIsAuthenticated(result.authenticated);
      setStore(result.store);
      return result;
    } catch {
      setIsAuthenticated(false);
      setStore(null);
      return { authenticated: false, store: null, itemCount: 0 };
    }
  }, [sendCommand]);

  // Ref to avoid stale closure in the isReady effect
  const checkAuthRef = useRef(checkAuth);
  checkAuthRef.current = checkAuth;

  const searchProducts = useCallback(
    async (query: string, limit = 5): Promise<{ products: HebProduct[]; raw: string | null }> => {
      const result = await sendCommand('searchProducts', { query, limit });
      // Handle both array (legacy) and object response
      if (Array.isArray(result)) return { products: result, raw: null };
      return { products: result.products ?? [], raw: result.raw ?? null };
    },
    [sendCommand],
  );

  const addToCart = useCallback(
    (productId: string, skuId: string, quantity = 1): Promise<HebCart> =>
      sendCommand('addToCart', { productId, skuId, quantity }),
    [sendCommand],
  );

  const updateCartItem = useCallback(
    (productId: string, skuId: string, quantity: number): Promise<HebCart> =>
      sendCommand('updateCartItem', { productId, skuId, quantity }),
    [sendCommand],
  );

  const removeFromCart = useCallback(
    (productId: string, skuId: string): Promise<HebCart> =>
      sendCommand('removeFromCart', { productId, skuId }),
    [sendCommand],
  );

  const getCart = useCallback((): Promise<HebCart> => sendCommand('getCart'), [sendCommand]);

  const reload = useCallback(() => {
    isReadyRef.current = false;
    setIsReady(false);
    // Reject all pending callbacks
    for (const [id, cb] of callbacksRef.current) {
      clearTimeout(cb.timer);
      cb.reject(new Error('Bridge reloading'));
    }
    callbacksRef.current.clear();
    webViewRef.current?.reload();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, cb] of callbacksRef.current) {
        clearTimeout(cb.timer);
      }
      callbacksRef.current.clear();
    };
  }, []);

  const ctx: HebBridgeContextType = {
    isReady,
    isAuthenticated,
    store,
    checkAuth,
    searchProducts,
    addToCart,
    updateCartItem,
    removeFromCart,
    getCart,
    reload,
  };

  return (
    <HebBridgeContext.Provider value={ctx}>
      {children}
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          ref={webViewRef}
          source={{ uri: 'https://www.heb.com/' }}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          onLoadEnd={handleLoadEnd}
          onMessage={handleMessage}
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
          originWhitelist={['*']}
          style={styles.webview}
        />
      </View>
    </HebBridgeContext.Provider>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
  webview: {
    width: 1,
    height: 1,
  },
});
