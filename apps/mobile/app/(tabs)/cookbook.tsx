import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { api } from '@/lib/api';
import { useTheme, ThemeColors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface SavedMeal {
  id: string;
  recipe_id: string;
  title: string;
  description: string | null;
  meal_type: string;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number;
  saved_at: string;
}

interface PastMealPlan {
  id: string;
  title: string | null;
  week_start: string;
  created_at: string;
  meal_count: number;
  meals: Array<{
    id: string;
    title: string;
    meal_type: string;
    day_of_week: number;
  }>;
}

type TabView = 'favorites' | 'history';

export default function CookbookScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<TabView>('favorites');
  const [favorites, setFavorites] = useState<SavedMeal[]>([]);
  const [history, setHistory] = useState<PastMealPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    try {
      const data = await api.get<{ favorites: SavedMeal[] }>('/api/recipes/favorites');
      console.log('[Cookbook] Favorites:', data.favorites?.length ?? 0, 'items');
      setFavorites(data.favorites ?? []);
    } catch (err) {
      console.log('[Cookbook] Failed to fetch favorites:', err);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await api.get<{ plans: PastMealPlan[] }>('/api/meal-plans/history');
      console.log('[Cookbook] History:', data.plans?.length ?? 0, 'plans');
      setHistory(data.plans ?? []);
    } catch (err) {
      console.log('[Cookbook] Failed to fetch history:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([fetchFavorites(), fetchHistory()]).finally(() => setLoading(false));
    }, [fetchFavorites, fetchHistory])
  );

  const handleRemoveFavorite = (meal: SavedMeal) => {
    Alert.alert('Remove Favorite', `Remove "${meal.title}" from favorites?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/recipes/${meal.recipe_id}/favorite`);
            setFavorites((prev) => prev.filter((f) => f.recipe_id !== meal.recipe_id));
          } catch {
            Alert.alert('Error', 'Failed to remove favorite.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <ScreenContainer title="Cookbook">
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Cookbook">
      {/* Tab switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
          onPress={() => setActiveTab('favorites')}
        >
          <AppIcon
            name={activeTab === 'favorites' ? 'heart.fill' : 'heart'}
            size={16}
            color={activeTab === 'favorites' ? colors.primary : colors.textTertiary}
          />
          <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>
            Favorites
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <AppIcon
            name="calendar"
            size={16}
            color={activeTab === 'history' ? colors.primary : colors.textTertiary}
          />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'favorites' ? (
        <FavoritesList
          favorites={favorites}
          onRemove={handleRemoveFavorite}
          onRefresh={fetchFavorites}
        />
      ) : (
        <HistoryList history={history} onRefresh={fetchHistory} />
      )}
    </ScreenContainer>
  );
}

function FavoritesList({
  favorites,
  onRemove,
  onRefresh,
}: {
  favorites: SavedMeal[];
  onRemove: (meal: SavedMeal) => void;
  onRefresh: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (favorites.length === 0) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <AppIcon name="heart" size={48} color={colors.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>No favorites yet</Text>
        <Text style={styles.emptyDesc}>
          Tap the heart icon on any meal to save it here for easy access later.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={favorites}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.mealCard}
          activeOpacity={0.7}
          onPress={() =>
            router.push({
              pathname: '/recipe/[id]',
              params: { id: item.recipe_id, title: item.title },
            })
          }
        >
          <View style={styles.mealCardBody}>
            <View style={styles.mealCardInfo}>
              <Text style={styles.mealCardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.description && (
                <Text style={styles.mealCardDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              )}
              <View style={styles.mealCardMeta}>
                <Text style={styles.mealCardType}>{item.meal_type}</Text>
                {(item.prep_time_minutes || item.cook_time_minutes) && (
                  <View style={styles.metaItem}>
                    <AppIcon name="timer" size={12} color={colors.textTertiary} />
                    <Text style={styles.metaText}>
                      {(item.prep_time_minutes ?? 0) + (item.cook_time_minutes ?? 0)} min
                    </Text>
                  </View>
                )}
                {item.servings > 0 && (
                  <View style={styles.metaItem}>
                    <AppIcon name="person.2" size={12} color={colors.textTertiary} />
                    <Text style={styles.metaText}>{item.servings}</Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={styles.heartButton}
              onPress={() => onRemove(item)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <AppIcon name="heart.fill" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

function HistoryList({
  history,
  onRefresh,
}: {
  history: PastMealPlan[];
  onRefresh: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (history.length === 0) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <AppIcon name="calendar" size={48} color={colors.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>No meal plan history</Text>
        <Text style={styles.emptyDesc}>
          Your past meal plans will appear here so you can revisit favorite weeks.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={history}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>{item.title ?? 'Meal Plan'}</Text>
            <Text style={styles.historyDate}>
              Week of {formatDate(item.week_start)}
            </Text>
          </View>
          <View style={styles.historyMeals}>
            {item.meals.slice(0, 5).map((meal) => (
              <View key={meal.id} style={styles.historyMealRow}>
                <View style={styles.historyDayBadge}>
                  <Text style={styles.historyDayText}>{DAY_NAMES[meal.day_of_week]}</Text>
                </View>
                <Text style={styles.historyMealName} numberOfLines={1}>
                  {meal.title}
                </Text>
              </View>
            ))}
            {item.meal_count > 5 && (
              <Text style={styles.historyMore}>
                +{item.meal_count - 5} more meal{item.meal_count - 5 > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        </View>
      )}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceSecondary,
      borderRadius: borderRadius.md,
      padding: 3,
      marginBottom: spacing.md,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.sm + 2,
      gap: spacing.xs,
    },
    tabActive: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 1,
    },
    tabText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.textTertiary,
    },
    tabTextActive: {
      color: colors.primary,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxl * 2,
    },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surfaceSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    emptyTitle: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.semibold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    emptyDesc: {
      fontSize: fontSize.md,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    listContent: {
      paddingBottom: spacing.xxl,
    },
    separator: { height: spacing.sm },
    mealCard: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
    },
    mealCardBody: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    mealCardInfo: { flex: 1 },
    mealCardTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    mealCardDesc: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: spacing.xs,
    },
    mealCardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    mealCardType: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: colors.primary,
      textTransform: 'capitalize',
      backgroundColor: colors.primaryLight + '15',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.sm,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    metaText: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
    },
    heartButton: {
      padding: spacing.xs,
      alignSelf: 'flex-start',
    },
    historyCard: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
    },
    historyHeader: {
      marginBottom: spacing.sm,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    historyTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: colors.text,
    },
    historyDate: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      marginTop: 2,
    },
    historyMeals: {
      gap: spacing.xs,
    },
    historyMealRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    historyDayBadge: {
      backgroundColor: colors.primaryLight + '15',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.sm,
      minWidth: 36,
      alignItems: 'center',
    },
    historyDayText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      color: colors.primary,
    },
    historyMealName: {
      flex: 1,
      fontSize: fontSize.sm,
      color: colors.text,
    },
    historyMore: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
      marginTop: spacing.xs,
      paddingLeft: 36 + spacing.sm,
    },
  });
