import { useState, useCallback } from 'react';
import { useHebBridge, type HebProduct, type HebCart } from '@/components/HebBridge';
import { api } from '@/lib/api';

// ─── Types ───

interface GroceryItemWithMatch {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  in_pantry: boolean;
  checked: boolean;
  product_matches: Array<{
    id: string;
    product_id: string;
    sku_id: string;
    product_name: string;
    brand: string | null;
    size: string | null;
    price: number | null;
    unit_price: string | null;
    image_url: string | null;
    product_url: string | null;
    in_stock: boolean;
    status: string;
  }>;
}

interface HebSession {
  connected: boolean;
  store: { storeId: string; name: string } | null;
  lastUpdated: string | null;
}

interface CartAddResult {
  results: Array<{ productId: string; success: boolean; error?: string }>;
  cart: HebCart | null;
}

// ─── Hook ───

export function useHeb() {
  const bridge = useHebBridge();

  const [session, setSession] = useState<HebSession | null>(null);
  const [itemsWithMatches, setItemsWithMatches] = useState<GroceryItemWithMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Check authentication via the bridge WebView. */
  const checkSession = useCallback(async (): Promise<HebSession> => {
    try {
      const result = await bridge.checkAuth();
      const s: HebSession = {
        connected: result.authenticated,
        store: result.store,
        lastUpdated: new Date().toISOString(),
      };
      setSession(s);
      return s;
    } catch {
      const s: HebSession = { connected: false, store: null, lastUpdated: null };
      setSession(s);
      return s;
    }
  }, [bridge]);

  /** Disconnect (clear cookies by reloading bridge). */
  const disconnect = useCallback(async () => {
    bridge.reload();
    setSession({ connected: false, store: null, lastUpdated: null });
  }, [bridge]);

  /**
   * Match grocery items to H-E-B products.
   * Uses the bridge for product search and the API for persistence.
   */
  const matchProducts = useCallback(
    async (mealPlanId: string) => {
      setMatching(true);
      setError(null);

      try {
        // Get current grocery items from the API
        const res = await api.get<{ items: GroceryItemWithMatch[] }>(
          `/api/grocery-list/${mealPlanId}/matches`,
        );
        const items = res.items;

        // Only match items the user still needs (skip checked / pantry items)
        const itemsToMatch = items.filter((item) => !item.checked && !item.in_pantry);

        // Search H-E-B for each item via the bridge
        for (const item of itemsToMatch) {
          try {
            const { products } = await bridge.searchProducts(item.name, 5);
            const bestMatch = products[0];

            if (bestMatch) {
              await api.put(`/api/grocery-items/${item.id}/match`, {
                productId: bestMatch.productId,
                skuId: bestMatch.skuId,
                productName: bestMatch.name,
                brand: bestMatch.brand,
                size: bestMatch.size,
                price: bestMatch.price,
                unitPrice: bestMatch.unitPrice,
                imageUrl: bestMatch.imageUrl,
                productUrl: bestMatch.productUrl,
                inStock: bestMatch.inStock,
                category: bestMatch.category,
              });
            }
          } catch (err) {
            console.warn(`Failed to match "${item.name}":`, err);
          }
        }

        // Refetch to get the updated matches
        await fetchMatches(mealPlanId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to match products';
        setError(msg);
        throw err;
      } finally {
        setMatching(false);
      }
    },
    [bridge],
  );

  /** Fetch stored matches from the API. */
  const fetchMatches = useCallback(async (mealPlanId: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ items: GroceryItemWithMatch[] }>(
        `/api/grocery-list/${mealPlanId}/matches`,
      );
      setItemsWithMatches(res.items);
      return res.items;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load matches';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Save/update a product match via the API. */
  const confirmMatch = useCallback(
    async (itemId: string, product: HebProduct) => {
      try {
        await api.put(`/api/grocery-items/${itemId}/match`, {
          productId: product.productId,
          skuId: product.skuId,
          productName: product.name,
          brand: product.brand,
          size: product.size,
          price: product.price,
          unitPrice: product.unitPrice,
          imageUrl: product.imageUrl,
          productUrl: product.productUrl,
          inStock: product.inStock,
          category: product.category,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update match';
        setError(msg);
        throw err;
      }
    },
    [],
  );

  /** Search H-E-B products via the bridge. */
  const searchProducts = useCallback(
    async (query: string) => {
      const { products } = await bridge.searchProducts(query, 5);
      return products;
    },
    [bridge],
  );

  /**
   * Add items to the H-E-B cart via the bridge,
   * then update match statuses via the API.
   */
  const addToCart = useCallback(
    async (
      items: Array<{
        productId: string;
        skuId: string;
        quantity?: number;
        groceryItemId?: string;
      }>,
    ): Promise<CartAddResult> => {
      setAddingToCart(true);
      setError(null);

      try {
        const results: CartAddResult['results'] = [];
        let latestCart: HebCart | null = null;

        for (const item of items) {
          try {
            latestCart = await bridge.addToCart(
              item.productId,
              item.skuId,
              item.quantity ?? 1,
            );

            // Update match status in the database
            if (item.groceryItemId) {
              await api.post('/api/grocery-items/update-status', {
                updates: [{ groceryItemId: item.groceryItemId, status: 'in_cart' }],
              }).catch(() => {
                // Non-critical: match status update failed, cart add succeeded
              });
            }

            results.push({ productId: item.productId, success: true });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            results.push({ productId: item.productId, success: false, error: msg });
          }
        }

        return { results, cart: latestCart };
      } finally {
        setAddingToCart(false);
      }
    },
    [bridge],
  );

  /** Get the current H-E-B cart via the bridge. */
  const getCart = useCallback(async () => {
    setLoading(true);
    try {
      return await bridge.getCart();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load cart';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  return {
    session,
    itemsWithMatches,
    loading,
    matching,
    addingToCart,
    error,
    checkSession,
    disconnect,
    matchProducts,
    fetchMatches,
    confirmMatch,
    searchProducts,
    addToCart,
    getCart,
  };
}
