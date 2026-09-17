import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { AppIcon } from '@/components/AppIcon';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { useMealPlan } from '@/hooks/useMealPlan';
import { useGrocery } from '@/hooks/useGrocery';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

const CATEGORY_LABELS: Record<string, string> = {
  produce: '🥬  Produce',
  meat: '🥩  Meat',
  seafood: '🐟  Seafood',
  dairy: '🧀  Dairy',
  bakery: '🍞  Bakery',
  pantry: '🫙  Pantry',
  frozen: '🧊  Frozen',
  beverages: '🥤  Beverages',
  spices: '🌶️  Spices',
  other: '📦  Other',
};

const CATEGORY_ORDER = [
  'produce', 'meat', 'seafood', 'dairy', 'bakery',
  'pantry', 'frozen', 'beverages', 'spices', 'other',
];

interface GroceryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  in_pantry: boolean;
  checked: boolean;
}

export default function GroceriesScreen() {
  const { currentPlan } = useMealPlan();
  const {
    groceryList,
    loading,
    generating,
    error,
    generateGroceryList,
    fetchGroceryList,
    toggleItem,
  } = useGrocery();

  useEffect(() => {
    if (currentPlan?.id && !groceryList) {
      fetchGroceryList(currentPlan.id);
    }
  }, [currentPlan?.id]);

  const handleGenerate = async () => {
    if (!currentPlan?.id) return;
    try {
      await generateGroceryList(currentPlan.id);
    } catch {
      Alert.alert('Error', 'Failed to generate grocery list. Please try again.');
    }
  };

  // Group items by category into sections
  const sections = useMemo(() => {
    if (!groceryList?.items.length) return [];

    const groups = new Map<string, GroceryItem[]>();
    for (const item of groceryList.items) {
      if (item.in_pantry) continue; // Show pantry items separately
      const cat = item.category || 'other';
      const list = groups.get(cat) ?? [];
      list.push(item);
      groups.set(cat, list);
    }

    const pantryItems = groceryList.items.filter((i) => i.in_pantry);

    const result = CATEGORY_ORDER
      .filter((cat) => groups.has(cat))
      .map((cat) => ({
        title: CATEGORY_LABELS[cat] ?? cat,
        data: groups.get(cat)!,
      }));

    if (pantryItems.length > 0) {
      result.push({
        title: '✅  Already in Pantry',
        data: pantryItems,
      });
    }

    return result;
  }, [groceryList?.items]);

  const checkedCount = groceryList?.items.filter((i) => i.checked && !i.in_pantry).length ?? 0;
  const totalCount = groceryList?.items.filter((i) => !i.in_pantry).length ?? 0;

  // No meal plan state
  if (!currentPlan) {
    return (
      <ScreenContainer title="Groceries">
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <AppIcon name="cart" size={48} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>No grocery list yet</Text>
          <Text style={styles.emptyDescription}>
            Create a meal plan first, then generate your grocery list here.
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

  // Has meal plan but no grocery list generated yet
  if (!groceryList && !loading) {
    return (
      <ScreenContainer title="Groceries">
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <AppIcon name="list.bullet" size={48} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>Ready to build your list</Text>
          <Text style={styles.emptyDescription}>
            Your meal plan "{currentPlan.title}" has {currentPlan.meals.length} meals.
            Generate a consolidated grocery list from all recipes.
          </Text>
          <Button
            title={generating ? 'Generating...' : 'Generate Grocery List'}
            onPress={handleGenerate}
            loading={generating}
            style={styles.generateButton}
          />
          <TouchableOpacity
            style={styles.pantryLink}
            onPress={() => router.push('/pantry')}
          >
            <AppIcon name="tray" size={16} color={colors.primary} />
            <Text style={styles.pantryLinkText}>Manage pantry items first</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  // Loading
  if (loading) {
    return (
      <ScreenContainer title="Groceries">
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  // Grocery list view
  return (
    <ScreenContainer title="Groceries">
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>
            {checkedCount} of {totalCount} items
          </Text>
          <TouchableOpacity onPress={() => router.push('/pantry')}>
            <Text style={styles.pantryNavText}>Pantry</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: totalCount > 0 ? `${(checkedCount / totalCount) * 100}%` : '0%' },
            ]}
          />
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <GroceryItemRow item={item} onToggle={() => toggleItem(item.id)} />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
      />

      {/* Actions */}
      <View style={styles.footer}>
        <Button
          title="Regenerate List"
          onPress={handleGenerate}
          variant="outline"
          size="sm"
          loading={generating}
        />
        <Button
          title="Match H‑E‑B Products"
          onPress={() =>
            router.push({
              pathname: '/heb-match',
              params: { mealPlanId: currentPlan?.id },
            })
          }
          size="sm"
        />
      </View>
    </ScreenContainer>
  );
}

function GroceryItemRow({
  item,
  onToggle,
}: {
  item: GroceryItem;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.itemRow, item.checked && styles.itemRowChecked]}
      onPress={onToggle}
      activeOpacity={0.6}
    >
      <AppIcon
        name={item.checked ? 'checkmark.square.fill' : 'square'}
        size={22}
        color={item.checked ? colors.primary : colors.textTertiary}
      />
      <View style={styles.itemContent}>
        <Text
          style={[styles.itemName, item.checked && styles.itemNameChecked]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        {(item.quantity || item.unit) && (
          <Text style={[styles.itemQty, item.checked && styles.itemQtyChecked]}>
            {formatQty(item.quantity, item.unit)}
          </Text>
        )}
      </View>
      {item.in_pantry && (
        <View style={styles.pantryBadge}>
          <Text style={styles.pantryBadgeText}>pantry</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function formatQty(quantity: number | null, unit: string | null): string {
  if (!quantity) return unit ?? '';
  const q = quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(1);
  return unit ? `${q} ${unit}` : q;
}

const styles = StyleSheet.create({
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
  emptyDescription: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  goHomeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.primaryLight + '15',
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  goHomeText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  generateButton: {
    minWidth: 220,
  },
  pantryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  pantryLinkText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    marginBottom: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  pantryNavText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  errorBanner: {
    backgroundColor: colors.error + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
  },
  sectionHeader: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.text,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  itemRowChecked: {
    opacity: 0.6,
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: colors.textTertiary,
  },
  itemQty: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemQtyChecked: {
    color: colors.textTertiary,
  },
  pantryBadge: {
    backgroundColor: colors.primaryLight + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  pantryBadgeText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  footer: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
