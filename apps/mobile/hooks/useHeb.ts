import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface HebProduct {
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

interface ProductMatch {
  groceryItemId: string;
  groceryItemName: string;
  products: HebProduct[];
  bestMatch: HebProduct | null;
}

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

interface CartResult {
  results: Array<{ productId: string; success: boolean; error?: string }>;
  cart: {
    id: string;
    items: Array<{
      productId: string;
      skuId: string;
      name: string;
      quantity: number;
      price: number | null;
      imageUrl: string | null;
    }>;
    estimatedTotal: number | null;
    itemCount: number;
    store: { storeId: string; name: string } | null;
  } | null;
}

export function useHeb() {
  const [session, setSession] = useState<HebSession | null>(null);
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [itemsWithMatches, setItemsWithMatches] = useState<GroceryItemWithMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await api.get<HebSession>('/api/heb/session');
      setSession(res);
      return res;
    } catch {
      setSession({ connected: false, store: null, lastUpdated: null });
      return { connected: false, store: null, lastUpdated: null };
    }
  }, []);

  const saveSession = useCallback(async (cookies: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<HebSession>('/api/heb/session', { cookies });
      setSession(res);
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect H-E-B account';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await api.delete('/api/heb/session');
      setSession({ connected: false, store: null, lastUpdated: null });
    } catch {
      // ignore
    }
  }, []);

  const matchProducts = useCallback(async (mealPlanId: string) => {
    setMatching(true);
    setError(null);
    try {
      const res = await api.post<{ matches: ProductMatch[] }>(
        `/api/grocery-list/${mealPlanId}/match-products`
      );
      setMatches(res.matches);
      return res.matches;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to match products';
      setError(msg);
      throw err;
    } finally {
      setMatching(false);
    }
  }, []);

  const fetchMatches = useCallback(async (mealPlanId: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ items: GroceryItemWithMatch[] }>(
        `/api/grocery-list/${mealPlanId}/matches`
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

  const confirmMatch = useCallback(async (
    itemId: string,
    product: HebProduct
  ) => {
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
  }, []);

  const searchProducts = useCallback(async (query: string) => {
    const res = await api.get<{ products: HebProduct[] }>(
      `/api/heb/search?q=${encodeURIComponent(query)}&limit=5`
    );
    return res.products;
  }, []);

  const addToCart = useCallback(async (
    items: Array<{ productId: string; skuId: string; quantity?: number; groceryItemId?: string }>
  ) => {
    setAddingToCart(true);
    setError(null);
    try {
      const res = await api.post<CartResult>('/api/heb/cart/add', {
        items: items.map((i) => ({
          productId: i.productId,
          skuId: i.skuId,
          quantity: i.quantity ?? 1,
          groceryItemId: i.groceryItemId,
        })),
      });
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add items to cart';
      setError(msg);
      throw err;
    } finally {
      setAddingToCart(false);
    }
  }, []);

  const getCart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ cart: CartResult['cart'] }>('/api/heb/cart');
      return res.cart;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load cart';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    session,
    matches,
    itemsWithMatches,
    loading,
    matching,
    addingToCart,
    error,
    checkSession,
    saveSession,
    disconnect,
    matchProducts,
    fetchMatches,
    confirmMatch,
    searchProducts,
    addToCart,
    getCart,
  };
}
