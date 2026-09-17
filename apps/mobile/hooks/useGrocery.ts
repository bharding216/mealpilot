import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface GroceryItem {
  id: string;
  grocery_list_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  in_pantry: boolean;
  checked: boolean;
  sort_order: number;
}

interface GroceryList {
  id: string;
  user_id: string;
  meal_plan_id: string;
  created_at: string;
  items: GroceryItem[];
}

interface PantryItem {
  id: string;
  user_id: string;
  name: string;
  category: string;
}

export function useGrocery() {
  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateGroceryList = useCallback(async (mealPlanId: string) => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.post<{ groceryList: GroceryList }>(
        `/api/grocery-list/${mealPlanId}/generate`
      );
      setGroceryList(res.groceryList);
      return res.groceryList;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate grocery list';
      setError(msg);
      throw err;
    } finally {
      setGenerating(false);
    }
  }, []);

  const fetchGroceryList = useCallback(async (mealPlanId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ groceryList: GroceryList | null }>(
        `/api/grocery-list/${mealPlanId}`
      );
      setGroceryList(res.groceryList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch grocery list';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleItem = useCallback(async (itemId: string) => {
    // Optimistic update
    setGroceryList((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === itemId ? { ...item, checked: !item.checked } : item
        ),
      };
    });

    try {
      await api.patch<{ item: GroceryItem }>(`/api/grocery-items/${itemId}/toggle`);
    } catch {
      // Revert on error
      setGroceryList((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === itemId ? { ...item, checked: !item.checked } : item
          ),
        };
      });
    }
  }, []);

  const fetchPantry = useCallback(async () => {
    try {
      const res = await api.get<{ items: PantryItem[] }>('/api/pantry');
      setPantryItems(res.items);
    } catch {
      // Silent fail for pantry
    }
  }, []);

  const addPantryItem = useCallback(async (name: string, category: string = 'other') => {
    try {
      const res = await api.post<{ item: PantryItem }>('/api/pantry', { name, category });
      setPantryItems((prev) => [...prev, res.item]);
      return res.item;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add pantry item';
      throw new Error(msg);
    }
  }, []);

  const removePantryItem = useCallback(async (itemId: string) => {
    setPantryItems((prev) => prev.filter((p) => p.id !== itemId));
    try {
      await api.delete(`/api/pantry/${itemId}`);
    } catch {
      // If delete fails, refetch
      fetchPantry();
    }
  }, [fetchPantry]);

  return {
    groceryList,
    pantryItems,
    loading,
    generating,
    error,
    generateGroceryList,
    fetchGroceryList,
    toggleItem,
    fetchPantry,
    addPantryItem,
    removePantryItem,
  };
}
