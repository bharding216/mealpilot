import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { useHeb } from '@/hooks/useHeb';
import { api } from '@/lib/api';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

type Step = 'idle' | 'sending' | 'otp' | 'verifying';

export default function HebConnectScreen() {
  const { session, checkSession, disconnect } = useHeb();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<Step>('idle');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loginId, setLoginId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkSession().finally(() => setChecking(false));
  }, []);

  const handleSendCode = async () => {
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setStep('sending');
    setError(null);

    try {
      const res = await api.post<{ loginId: string; message: string }>('/api/heb/login', { email });
      setLoginId(res.loginId);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start login. Try again.');
      setStep('idle');
    }
  };

  const handleVerifyOtp = async () => {
    if (!loginId || otp.length !== 6) return;

    setStep('verifying');
    setError(null);

    try {
      const res = await api.post<{ connected: boolean; store: { storeId: string; name: string } | null }>(
        '/api/heb/verify',
        { loginId, otp }
      );

      await checkSession();

      Alert.alert(
        'Connected! 🎉',
        `Your H‑E‑B account is linked.${res.store ? `\n\nStore: ${res.store.name}` : ''}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed.';
      setError(msg);
      setStep('otp');
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect H‑E‑B', 'This will remove your H‑E‑B connection.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await disconnect();
          await checkSession();
        },
      },
    ]);
  };

  // ── Loading ──
  if (checking) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.checkingText}>Checking connection...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Already connected ──
  if (session?.connected) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.content}>
          <View style={styles.statusCard}>
            <AppIcon name="checkmark.circle.fill" size={48} color={colors.primary} />
            <Text style={styles.statusTitle}>Connected to H‑E‑B</Text>
            {session.store && (
              <View style={styles.storeRow}>
                <AppIcon name="storefront" size={16} color={colors.textSecondary} />
                <Text style={styles.storeLabel}>{session.store.name}</Text>
              </View>
            )}
          </View>
          <Button title="Reconnect" onPress={() => { setStep('idle'); }} variant="outline" style={styles.actionButton} />
          <Button title="Disconnect" onPress={handleDisconnect} variant="outline" style={styles.disconnectButton} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Login flow ──
  return (
    <SafeAreaView style={styles.container}>
      <Header />
      <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {step === 'idle' || step === 'sending' ? (
          // ── Email entry ──
          <View style={styles.formCard}>
            <AppIcon name="storefront" size={48} color={colors.primary} />
            <Text style={styles.formTitle}>Connect your H‑E‑B account</Text>
            <Text style={styles.formDesc}>
              Enter the email address you use for heb.com. We'll send a one-time code to verify.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={step !== 'sending'}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Button
              title={step === 'sending' ? 'Connecting to H‑E‑B...' : 'Send verification code'}
              onPress={handleSendCode}
              loading={step === 'sending'}
              disabled={!email.includes('@')}
              style={styles.submitButton}
            />
          </View>
        ) : (
          // ── OTP entry ──
          <View style={styles.formCard}>
            <AppIcon name="envelope" size={48} color={colors.primary} />
            <Text style={styles.formTitle}>Enter verification code</Text>
            <Text style={styles.formDesc}>
              We sent a 6-digit code to <Text style={styles.emailHighlight}>{email}</Text>.
              Check your email and enter it below.
            </Text>

            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="000000"
              placeholderTextColor={colors.textTertiary}
              value={otp}
              onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              editable={step !== 'verifying'}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Button
              title={step === 'verifying' ? 'Verifying...' : 'Verify'}
              onPress={handleVerifyOtp}
              loading={step === 'verifying'}
              disabled={otp.length !== 6}
              style={styles.submitButton}
            />

            <TouchableOpacity
              onPress={() => { setStep('idle'); setOtp(''); setError(null); }}
              style={styles.backLink}
            >
              <Text style={styles.backLinkText}>Use a different email</Text>
            </TouchableOpacity>
          </View>
        )}

      </KeyboardAvoidingView>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.surface,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.semibold,
    color: colors.text, textAlign: 'center',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  checkingText: { fontSize: fontSize.sm, color: colors.textSecondary },
  content: { flex: 1, padding: spacing.lg },

  // Connected state
  statusCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.xl, alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg,
  },
  statusTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.text },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  storeLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  actionButton: { marginBottom: spacing.sm },
  disconnectButton: { borderColor: colors.error },

  // Form
  formCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.xl, alignItems: 'center', gap: spacing.md,
  },
  formTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, textAlign: 'center' },
  formDesc: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  emailHighlight: { fontWeight: fontWeight.semibold, color: colors.text },
  input: {
    width: '100%', backgroundColor: colors.background, borderWidth: 1,
    borderColor: colors.borderLight, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4,
    fontSize: fontSize.md, color: colors.text,
  },
  otpInput: {
    fontSize: fontSize.xxl, textAlign: 'center', letterSpacing: 12,
    fontWeight: fontWeight.bold,
  },
  submitButton: { width: '100%', marginTop: spacing.xs },
  errorText: { fontSize: fontSize.sm, color: colors.error, textAlign: 'center' },
  backLink: { marginTop: spacing.sm, paddingVertical: spacing.xs },
  backLinkText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
});
