import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface Preferences {
  dietary_restrictions: string[];
  disliked_foods: string[];
  favorite_cuisines: string[];
  grocery_budget: number | null;
  cooking_time_preference: 'quick' | 'moderate' | 'any' | null;
  kid_friendly: boolean;
  leftover_preference: 'yes' | 'no' | 'sometimes' | null;
  household_size: number | null;
}

const DEFAULT_PREFS: Preferences = {
  dietary_restrictions: [],
  disliked_foods: [],
  favorite_cuisines: [],
  grocery_budget: null,
  cooking_time_preference: null,
  kid_friendly: false,
  leftover_preference: null,
  household_size: null,
};

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ preferences: Preferences }>('/api/preferences');
      if (res.preferences) {
        setPreferences(res.preferences);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load preferences';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const savePreferences = useCallback(async (updates: Partial<{
    dietaryRestrictions: string[];
    dislikedFoods: string[];
    favoriteCuisines: string[];
    groceryBudget: number | null;
    cookingTimePreference: 'quick' | 'moderate' | 'any' | null;
    kidFriendly: boolean;
    leftoverPreference: 'yes' | 'no' | 'sometimes' | null;
    householdSize: number | null;
  }>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.put<{ preferences: Preferences }>('/api/preferences', updates);
      if (res.preferences) {
        setPreferences(res.preferences);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save preferences';
      setError(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  return { preferences, loading, saving, error, savePreferences, fetchPreferences };
}
