import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { AppIcon } from '@/components/AppIcon';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { useHebBridge } from '@/components/HebBridge';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const bridge = useHebBridge();

  useEffect(() => {
    bridge.checkAuth().catch(() => {});
  }, []);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: signOut,
      },
    ]);
  };

  return (
    <ScreenContainer title="Profile" scrollable>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <AppIcon name="person.fill" size={28} color={colors.textInverse} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.email}>{user?.email ?? 'Not signed in'}</Text>
          <Text style={styles.memberSince}>MealPilot member</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <TouchableOpacity
          style={styles.prefsButton}
          onPress={() => router.push('/preferences')}
          activeOpacity={0.7}
        >
          <View style={styles.prefsButtonInner}>
            <AppIcon name="slider.horizontal.3" size={20} color={colors.primary} />
            <View style={styles.prefsButtonContent}>
              <Text style={styles.prefsButtonLabel}>Edit Preferences</Text>
              <Text style={styles.prefsButtonDesc}>
                Dietary restrictions, cuisines, budget, and more
              </Text>
            </View>
            <AppIcon name="chevron.right" size={18} color={colors.textTertiary} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Store</Text>
        <MenuItem
          icon="storefront"
          label="H‑E‑B Store"
          subtitle={bridge.isAuthenticated ? (bridge.store?.name ?? 'Connected') : 'Not connected'}
          onPress={() => router.push('/heb-connect')}
        />
      </View>

      <View style={styles.signOutContainer}>
        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="outline"
          style={styles.signOutButton}
        />
      </View>
    </ScreenContainer>
  );
}

function MenuItem({ icon, label, subtitle, onPress }: { icon: string; label: string; subtitle?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={onPress}>
      <AppIcon name={icon as any} size={20} color={colors.primary} />
      <View style={styles.menuItemContent}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      <AppIcon name="chevron.right" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  email: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  memberSince: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  prefsButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  prefsButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  prefsButtonContent: {
    flex: 1,
  },
  prefsButtonLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  prefsButtonDesc: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  menuItemContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  menuSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  signOutContainer: {
    paddingVertical: spacing.lg,
  },
  signOutButton: {
    borderColor: colors.error,
  },
});
