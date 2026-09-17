import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMealPlan } from '@/hooks/useMealPlan';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CATEGORY_EMOJI: Record<string, string> = {
  produce: '🥬',
  meat: '🥩',
  seafood: '🐟',
  dairy: '🧀',
  bakery: '🍞',
  pantry: '🫙',
  frozen: '🧊',
  beverages: '🥤',
  spices: '🌶️',
  other: '📦',
};

export default function RecipeScreen() {
  const { id, mealId, mealPlanId, title } = useLocalSearchParams<{
    id: string;
    mealId: string;
    mealPlanId: string;
    title: string;
  }>();

  const { currentPlan, replaceMeal, loading } = useMealPlan();

  // Find the meal in the current plan
  const meal = currentPlan?.meals.find((m) => m.id === mealId);
  const recipe = meal?.recipe;

  const handleReplace = () => {
    Alert.alert('Replace Meal', `Replace "${meal?.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replace',
        onPress: async () => {
          if (mealPlanId && mealId) {
            await replaceMeal(mealPlanId, mealId);
            router.back();
          }
        },
      },
    ]);
  };

  if (!recipe) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title={title ?? 'Recipe'} />
        <View style={styles.centered}>
          <Text style={styles.noRecipeText}>Recipe details not available.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const totalTime = (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0);

  return (
    <SafeAreaView style={styles.container}>
      <Header title={recipe.title} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Meta info */}
        <View style={styles.metaRow}>
          {meal && (
            <View style={styles.metaBadge}>
              <Text style={styles.metaBadgeText}>
                {DAY_NAMES[meal.day_of_week]} {meal.meal_type}
              </Text>
            </View>
          )}
          {recipe.servings > 0 && (
            <View style={styles.metaItem}>
              <AppIcon name="person.2" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{recipe.servings} servings</Text>
            </View>
          )}
          {totalTime > 0 && (
            <View style={styles.metaItem}>
              <AppIcon name="timer" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{totalTime} min</Text>
            </View>
          )}
        </View>

        {recipe.description && (
          <Text style={styles.description}>{recipe.description}</Text>
        )}

        {/* Time breakdown */}
        {(recipe.prep_time_minutes || recipe.cook_time_minutes) && (
          <View style={styles.timeRow}>
            {recipe.prep_time_minutes != null && recipe.prep_time_minutes > 0 && (
              <View style={styles.timeBlock}>
                <Text style={styles.timeValue}>{recipe.prep_time_minutes}</Text>
                <Text style={styles.timeLabel}>min prep</Text>
              </View>
            )}
            {recipe.cook_time_minutes != null && recipe.cook_time_minutes > 0 && (
              <View style={styles.timeBlock}>
                <Text style={styles.timeValue}>{recipe.cook_time_minutes}</Text>
                <Text style={styles.timeLabel}>min cook</Text>
              </View>
            )}
            {totalTime > 0 && (
              <View style={styles.timeBlock}>
                <Text style={[styles.timeValue, { color: colors.primary }]}>{totalTime}</Text>
                <Text style={styles.timeLabel}>min total</Text>
              </View>
            )}
          </View>
        )}

        {/* Ingredients */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {recipe.ingredients.map((ing, idx) => (
            <View key={idx} style={styles.ingredientRow}>
              <Text style={styles.ingredientEmoji}>
                {CATEGORY_EMOJI[ing.category] ?? '📦'}
              </Text>
              <View style={styles.ingredientInfo}>
                <Text style={styles.ingredientName}>
                  {formatQuantity(ing.quantity, ing.unit)} {ing.name}
                </Text>
                {ing.notes && (
                  <Text style={styles.ingredientNotes}>{ing.notes}</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          {recipe.instructions.map((step, idx) => (
            <View key={idx} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{idx + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.replaceButton}
            onPress={handleReplace}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <AppIcon name="arrow.clockwise" size={18} color={colors.primary} />
                <Text style={styles.replaceButtonText}>Replace this meal</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <AppIcon name="arrow.left" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.backButton} />
    </View>
  );
}

function formatQuantity(quantity: number | null, unit: string | null): string {
  if (!quantity) return '';
  const q = quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(1);
  return unit ? `${q} ${unit}` : q;
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
  noRecipeText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  backLink: {
    paddingVertical: spacing.sm,
  },
  backLinkText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metaBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  metaBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    textTransform: 'capitalize',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  description: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  timeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
  timeBlock: {
    alignItems: 'center',
  },
  timeValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  timeLabel: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  ingredientEmoji: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientName: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  ingredientNotes: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  stepText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  actions: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  replaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  replaceButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
});
