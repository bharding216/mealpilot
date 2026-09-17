import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput } from '@/components/TextInput';
import { Button } from '@/components/Button';
import { usePreferences } from '@/hooks/usePreferences';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

const CUISINE_OPTIONS = [
  'Mexican', 'Italian', 'Asian', 'American', 'Mediterranean',
  'Indian', 'Thai', 'Japanese', 'Chinese', 'Southern', 'Tex-Mex',
];

const DIETARY_OPTIONS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free',
  'Keto', 'Low-Carb', 'Paleo', 'Nut-Free',
];

const COOKING_TIME_OPTIONS = [
  { value: 'quick', label: 'Quick (< 30 min)' },
  { value: 'moderate', label: 'Moderate (30–60 min)' },
  { value: 'any', label: 'Any' },
] as const;

const LEFTOVER_OPTIONS = [
  { value: 'yes', label: 'Yes, plan for leftovers' },
  { value: 'no', label: 'No leftovers' },
  { value: 'sometimes', label: 'Sometimes' },
] as const;

export default function EditPreferencesScreen() {
  const { preferences, loading, saving, savePreferences } = usePreferences();

  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [dislikedFoods, setDislikedFoods] = useState('');
  const [favoriteCuisines, setFavoriteCuisines] = useState<string[]>([]);
  const [householdSize, setHouseholdSize] = useState('');
  const [groceryBudget, setGroceryBudget] = useState('');
  const [cookingTime, setCookingTime] = useState<string | null>(null);
  const [kidFriendly, setKidFriendly] = useState(false);
  const [leftoverPref, setLeftoverPref] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      setDietaryRestrictions(preferences.dietary_restrictions ?? []);
      setDislikedFoods((preferences.disliked_foods ?? []).join(', '));
      setFavoriteCuisines(preferences.favorite_cuisines ?? []);
      setHouseholdSize(preferences.household_size?.toString() ?? '');
      setGroceryBudget(preferences.grocery_budget?.toString() ?? '');
      setCookingTime(preferences.cooking_time_preference ?? null);
      setKidFriendly(preferences.kid_friendly ?? false);
      setLeftoverPref(preferences.leftover_preference ?? null);
    }
  }, [loading, preferences]);

  const handleSave = async () => {
    try {
      await savePreferences({
        dietaryRestrictions,
        dislikedFoods: dislikedFoods
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        favoriteCuisines,
        householdSize: householdSize ? parseInt(householdSize, 10) : null,
        groceryBudget: groceryBudget ? parseFloat(groceryBudget) : null,
        cookingTimePreference: cookingTime as 'quick' | 'moderate' | 'any' | null,
        kidFriendly,
        leftoverPreference: leftoverPref as 'yes' | 'no' | 'sometimes' | null,
      });
      Alert.alert('Saved', 'Your preferences have been updated.');
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save preferences. Please try again.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Household Size */}
        <TextInput
          label="Household Size"
          placeholder="e.g. 4"
          value={householdSize}
          onChangeText={setHouseholdSize}
          keyboardType="number-pad"
        />

        {/* Grocery Budget */}
        <TextInput
          label="Weekly Grocery Budget ($)"
          placeholder="e.g. 150"
          value={groceryBudget}
          onChangeText={setGroceryBudget}
          keyboardType="decimal-pad"
        />

        {/* Dietary Restrictions */}
        <Text style={styles.label}>Dietary Restrictions</Text>
        <View style={styles.chipGrid}>
          {DIETARY_OPTIONS.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              selected={dietaryRestrictions.includes(opt)}
              onPress={() =>
                setDietaryRestrictions((prev) =>
                  prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                )
              }
            />
          ))}
        </View>

        {/* Favorite Cuisines */}
        <Text style={styles.label}>Favorite Cuisines</Text>
        <View style={styles.chipGrid}>
          {CUISINE_OPTIONS.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              selected={favoriteCuisines.includes(opt)}
              onPress={() =>
                setFavoriteCuisines((prev) =>
                  prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                )
              }
            />
          ))}
        </View>

        {/* Disliked Foods */}
        <TextInput
          label="Disliked Foods"
          placeholder="e.g. mushrooms, olives, liver"
          value={dislikedFoods}
          onChangeText={setDislikedFoods}
        />

        {/* Cooking Time */}
        <Text style={styles.label}>Cooking Time Preference</Text>
        <View style={styles.optionGroup}>
          {COOKING_TIME_OPTIONS.map((opt) => (
            <RadioOption
              key={opt.value}
              label={opt.label}
              selected={cookingTime === opt.value}
              onPress={() => setCookingTime(opt.value)}
            />
          ))}
        </View>

        {/* Kid Friendly */}
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => setKidFriendly(!kidFriendly)}
          activeOpacity={0.7}
        >
          <Text style={styles.toggleLabel}>Kid-friendly meals</Text>
          <AppIcon
            name={kidFriendly ? 'checkmark.square.fill' : 'square'}
            size={24}
            color={kidFriendly ? colors.primary : colors.textTertiary}
          />
        </TouchableOpacity>

        {/* Leftover Preference */}
        <Text style={styles.label}>Leftover Preference</Text>
        <View style={styles.optionGroup}>
          {LEFTOVER_OPTIONS.map((opt) => (
            <RadioOption
              key={opt.value}
              label={opt.label}
              selected={leftoverPref === opt.value}
              onPress={() => setLeftoverPref(opt.value)}
            />
          ))}
        </View>

        <Button
          title="Save Preferences"
          onPress={handleSave}
          loading={saving}
          style={styles.saveButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <AppIcon name="arrow.left" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Preferences</Text>
      <View style={styles.backButton} />
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function RadioOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.radioRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <AppIcon
        name={selected ? 'circle.fill' : 'circle'}
        size={20}
        color={selected ? colors.primary : colors.textTertiary}
      />
      <Text style={[styles.radioLabel, selected && styles.radioLabelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  optionGroup: {
    marginBottom: spacing.md,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  radioLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  radioLabelSelected: {
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  toggleLabel: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
  saveButton: {
    marginTop: spacing.lg,
  },
});
