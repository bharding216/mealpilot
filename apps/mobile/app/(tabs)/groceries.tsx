import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

export default function GroceriesScreen() {
  return (
    <ScreenContainer title="Groceries">
      <View style={styles.emptyState}>
        <View style={styles.iconContainer}>
          <Ionicons name="cart-outline" size={48} color={colors.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>No grocery list yet</Text>
        <Text style={styles.emptyDescription}>
          Once you have an approved meal plan, MealPilot will generate a consolidated
          grocery list and match items to H‑E‑B products.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },
  iconContainer: {
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
  },
});
