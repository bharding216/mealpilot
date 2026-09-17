import React, { createContext, useContext, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface MealPlanMeal {
  id: string;
  meal_plan_id: string;
  day_of_week: number;
  meal_type: string;
  title: string;
  description: string | null;
  recipe_id: string | null;
  sort_order: number;
  recipe: Recipe | null;
}

interface Recipe {
  id: string;
  title: string;
  description: string | null;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  instructions: string[];
  ingredients: RecipeIngredient[];
}

interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  category: string;
}

interface MealPlanData {
  id: string;
  user_id: string;
  title: string | null;
  week_start: string;
  status: string;
  created_at: string;
  updated_at: string;
  meals: MealPlanMeal[];
}

interface MealPlanState {
  currentPlan: MealPlanData | null;
  loading: boolean;
  error: string | null;
  createMealPlan: (message: string) => Promise<MealPlanData>;
  fetchMealPlan: (id: string) => Promise<void>;
  fetchLatestMealPlan: () => Promise<void>;
  replaceMeal: (mealPlanId: string, mealId: string, message?: string) => Promise<void>;
  clearError: () => void;
}

const MealPlanContext = createContext<MealPlanState | undefined>(undefined);

export function MealPlanProvider({ children }: { children: React.ReactNode }) {
  const [currentPlan, setCurrentPlan] = useState<MealPlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMealPlan = useCallback(async (message: string): Promise<MealPlanData> => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ mealPlan: MealPlanData }>('/api/meal-plan', { message });
      setCurrentPlan(res.mealPlan);
      return res.mealPlan;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create meal plan';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMealPlan = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ mealPlan: MealPlanData }>(`/api/meal-plans/${id}`);
      setCurrentPlan(res.mealPlan);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch meal plan';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLatestMealPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ mealPlan: MealPlanData | null }>('/api/meal-plans/latest');
      setCurrentPlan(res.mealPlan);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch meal plan';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const replaceMeal = useCallback(async (mealPlanId: string, mealId: string, message?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ mealPlan: MealPlanData }>(
        `/api/meal-plans/${mealPlanId}/meals/${mealId}/replace`,
        message ? { message } : undefined
      );
      setCurrentPlan(res.mealPlan);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to replace meal';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <MealPlanContext.Provider
      value={{
        currentPlan,
        loading,
        error,
        createMealPlan,
        fetchMealPlan,
        fetchLatestMealPlan,
        replaceMeal,
        clearError,
      }}
    >
      {children}
    </MealPlanContext.Provider>
  );
}

export function useMealPlan() {
  const context = useContext(MealPlanContext);
  if (!context) {
    throw new Error('useMealPlan must be used within a MealPlanProvider');
  }
  return context;
}
