import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { AppIcon } from '@/components/AppIcon';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useMealPlan } from '@/hooks/useMealPlan';
import { useTheme, ThemeColors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function PlanScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentPlan, loading, error, fetchLatestMealPlan, replaceMeal } = useMealPlan();

  useEffect(() => {
    if (!currentPlan) {
      fetchLatestMealPlan();
    }
  }, []);

  const handleReplaceMeal = (mealId: string, mealTitle: string, dayOfWeek: number) => {
    Alert.alert(
      'Replace Meal',
      `Replace "${mealTitle}" on ${DAY_NAMES_FULL[dayOfWeek]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          onPress: async () => {
            if (currentPlan) {
              await replaceMeal(currentPlan.id, mealId);
            }
          },
        },
      ]
    );
  };

  if (loading && !currentPlan) {
    return (
      <ScreenContainer title="Meal Plan">
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your meal plan...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!currentPlan || currentPlan.meals.length === 0) {
    return (
      <ScreenContainer title="Meal Plan">
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <AppIcon name="calendar" size={48} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>No meal plan yet</Text>
          <Text style={styles.emptyDescription}>
            Head to the Home tab and tell MealPilot what you want to eat this week!
          </Text>
          <TouchableOpacity
            style={styles.goHomeButton}
            onPress={() => router.navigate('/(tabs)/')}
          >
            <AppIcon name="bubble.left" size={16} color={colors.primary} />
            <Text style={styles.goHomeText}>Start planning</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const sortedMeals = [...currentPlan.meals].sort((a, b) => a.day_of_week - b.day_of_week);

  return (
    <ScreenContainer title="Meal Plan">
      <View style={styles.weekHeader}>
        <View>
          <Text style={styles.planTitle}>{currentPlan.title ?? 'This Week'}</Text>
          <Text style={styles.weekLabel}>
            Week of {formatDate(currentPlan.week_start)}
          </Text>
        </View>
        {loading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={sortedMeals}
        renderItem={({ item }) => (
          <MealCard
            meal={item}
            onPress={() =>
              router.push({
                pathname: '/recipe/[id]',
                params: {
                  id: item.recipe?.id ?? item.id,
                  mealId: item.id,
                  mealPlanId: currentPlan.id,
                  title: item.title,
                },
              })
            }
            onReplace={() => handleReplaceMeal(item.id, item.title, item.day_of_week)}
          />
        )}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </ScreenContainer>
  );
}

interface MealCardProps {
  meal: {
    id: string;
    day_of_week: number;
    meal_type: string;
    title: string;
    description: string | null;
    recipe: {
      prep_time_minutes: number | null;
      cook_time_minutes: number | null;
    } | null;
  };
  onPress: () => void;
  onReplace: () => void;
}

function MealCard({ meal, onPress, onReplace }: MealCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const totalTime = (meal.recipe?.prep_time_minutes ?? 0) + (meal.recipe?.cook_time_minutes ?? 0);

  return (
    <TouchableOpacity style={styles.mealCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.mealCardHeader}>
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>{DAY_NAMES[meal.day_of_week]}</Text>
        </View>
        <Text style={styles.mealType}>{meal.meal_type}</Text>
        <TouchableOpacity onPress={onReplace} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <AppIcon name="arrow.clockwise" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.mealTitle}>{meal.title}</Text>

      {meal.description && (
        <Text style={styles.mealDescription} numberOfLines={2}>
          {meal.description}
        </Text>
      )}

      <View style={styles.mealMeta}>
        {totalTime > 0 && (
          <View style={styles.metaItem}>
            <AppIcon name="timer" size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>{totalTime} min</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <AppIcon name="chevron.right" size={14} color={colors.textTertiary} />
          <Text style={styles.metaText}>View recipe</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: spacing.md, fontSize: fontSize.md, color: colors.textSecondary },
    emptyState: {
      flex: 1, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2,
    },
    emptyIcon: {
      width: 80, height: 80, borderRadius: borderRadius.full,
      backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    emptyTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm },
    emptyDescription: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
    goHomeButton: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2, backgroundColor: colors.primaryLight + '15',
      borderRadius: borderRadius.full, gap: spacing.xs,
    },
    goHomeText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
    weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    planTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
    weekLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
    errorBanner: { backgroundColor: colors.error + '15', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.sm, marginBottom: spacing.md },
    errorText: { fontSize: fontSize.sm, color: colors.error },
    listContent: { paddingBottom: spacing.xxl },
    separator: { height: spacing.sm },
    mealCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md },
    mealCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
    dayBadge: { backgroundColor: colors.primary + '15', paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs, borderRadius: borderRadius.sm },
    dayBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.primary },
    mealType: { flex: 1, fontSize: fontSize.xs, color: colors.textTertiary, textTransform: 'capitalize' },
    mealTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs },
    mealDescription: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
    mealMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    metaText: { fontSize: fontSize.xs, color: colors.textTertiary },
  });
