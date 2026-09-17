import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface PlaceholderMeal {
  day: string;
  title: string | null;
}

const PLACEHOLDER_MEALS: PlaceholderMeal[] = DAYS.map((day) => ({
  day,
  title: null,
}));

export default function PlanScreen() {
  const renderMeal = ({ item }: { item: PlaceholderMeal }) => (
    <TouchableOpacity style={styles.mealCard} activeOpacity={0.7}>
      <View style={styles.mealDay}>
        <Text style={styles.mealDayText}>{item.day}</Text>
      </View>
      <View style={styles.mealContent}>
        {item.title ? (
          <Text style={styles.mealTitle}>{item.title}</Text>
        ) : (
          <Text style={styles.mealEmpty}>No meal planned</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <ScreenContainer title="Meal Plan">
      <View style={styles.weekHeader}>
        <Text style={styles.weekLabel}>This Week</Text>
        <TouchableOpacity style={styles.generateButton}>
          <Ionicons name="sparkles" size={16} color={colors.primary} />
          <Text style={styles.generateText}>Generate</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={PLACEHOLDER_MEALS}
        renderItem={renderMeal}
        keyExtractor={(item) => item.day}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  weekLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight + '15',
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  generateText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  mealDay: {
    width: 90,
  },
  mealDayText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  mealContent: {
    flex: 1,
  },
  mealTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  mealEmpty: {
    fontSize: fontSize.md,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  separator: {
    height: spacing.sm,
  },
});
