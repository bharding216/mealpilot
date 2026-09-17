import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { TextInput } from '@/components/TextInput';
import { Button } from '@/components/Button';
import { useHeb } from '@/hooks/useHeb';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

export default function HebConnectScreen() {
  const { session, loading, error, checkSession, saveSession, disconnect } = useHeb();
  const [cookies, setCookies] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkSession().finally(() => setChecking(false));
  }, []);

  const handleConnect = async () => {
    if (!cookies.trim()) {
      Alert.alert('Missing Cookies', 'Please paste your H‑E‑B session cookies.');
      return;
    }
    try {
      await saveSession(cookies.trim());
      Alert.alert('Connected! 🎉', 'Your H‑E‑B account is linked.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Connection Failed', 'Could not validate the session. Make sure you copied the full cookie string.');
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect H‑E‑B',
      'This will remove your H‑E‑B session. You can reconnect later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnect();
          },
        },
      ]
    );
  };

  if (checking) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Already connected
  if (session?.connected) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.content}>
          <View style={styles.statusCard}>
            <View style={styles.statusIconContainer}>
              <AppIcon name="checkmark.circle.fill" size={40} color={colors.primary} />
            </View>
            <Text style={styles.statusTitle}>Connected to H‑E‑B</Text>
            {session.store && (
              <View style={styles.storeRow}>
                <AppIcon name="storefront" size={16} color={colors.textSecondary} />
                <Text style={styles.storeLabel}>{session.store.name}</Text>
              </View>
            )}
          </View>

          <View style={styles.actionsSection}>
            <Button
              title="Disconnect H‑E‑B Account"
              onPress={handleDisconnect}
              variant="outline"
              style={styles.disconnectButton}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Not connected — show instructions
  return (
    <SafeAreaView style={styles.container}>
      <Header />
      <View style={styles.content}>
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Connect your H‑E‑B account</Text>
          <Text style={styles.instructionsDesc}>
            To match products and add items to your H‑E‑B cart, we need your browser session cookies.
          </Text>

          <View style={styles.stepsList}>
            <StepItem number={1} text="Open heb.com in your browser and sign in" />
            <StepItem number={2} text='Open Developer Tools (F12) → Application → Cookies' />
            <StepItem number={3} text='Copy all cookies as a single string (name=value; name=value; ...)' />
            <StepItem number={4} text="Paste them below" />
          </View>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => Linking.openURL('https://www.heb.com')}
          >
            <Text style={styles.linkButtonText}>Open heb.com →</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          label="Session Cookies"
          placeholder="Paste your heb.com cookies here..."
          value={cookies}
          onChangeText={setCookies}
          multiline
          numberOfLines={4}
        />

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Button
          title={loading ? 'Validating...' : 'Connect H‑E‑B'}
          onPress={handleConnect}
          loading={loading}
          style={styles.connectButton}
        />
      </View>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <AppIcon name="arrow.left" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>H‑E‑B Account</Text>
      <View style={styles.backButton} />
    </View>
  );
}

function StepItem({ number, text }: { number: number; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNumber}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: spacing.lg, flex: 1 },
  instructionsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  instructionsTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  instructionsDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  stepsList: { gap: spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumber: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textInverse },
  stepText: { fontSize: fontSize.sm, color: colors.text, flex: 1, lineHeight: 20 },
  linkButton: { marginTop: spacing.md },
  linkButtonText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold },
  errorBanner: {
    backgroundColor: colors.error + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  connectButton: { marginTop: spacing.sm },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  statusIconContainer: { marginBottom: spacing.md },
  statusTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  storeLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  actionsSection: { marginTop: spacing.md },
  disconnectButton: { borderColor: colors.error },
});
