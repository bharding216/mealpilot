import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { useHebBridge } from '@/components/HebBridge';
import { useTheme, ThemeColors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

const HEB_SIGN_IN_URL = 'https://www.heb.com/account/sign-in';

type ScreenState = 'checking' | 'connected' | 'prompt' | 'webview' | 'verifying';

export default function HebConnectScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const bridge = useHebBridge();
  const loginWebViewRef = useRef<WebView>(null);
  const [state, setState] = useState<ScreenState>('checking');
  const [storeName, setStoreName] = useState<string | null>(null);
  const [webViewUrl, setWebViewUrl] = useState(HEB_SIGN_IN_URL);

  useEffect(() => {
    bridge.checkAuth().then((result) => {
      if (result.authenticated) {
        setStoreName(result.store?.name ?? null);
        setState('connected');
      } else {
        setState('prompt');
      }
    });
  }, []);

  const verifyLogin = useCallback(async () => {
    setState('verifying');
    bridge.reload();
    await new Promise((r) => setTimeout(r, 4000));

    try {
      const result = await bridge.checkAuth();
      if (result.authenticated) {
        setStoreName(result.store?.name ?? null);
        setState('connected');
        Alert.alert(
          'Connected! 🎉',
          `Your H‑E‑B account is linked.${result.store ? `\n\nStore: ${result.store.name}` : ''}`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        Alert.alert(
          'Not Connected Yet',
          'It looks like the login didn\'t complete. Make sure you\'re fully signed in on the H‑E‑B page, then tap "Done" again.',
        );
        setState('webview');
      }
    } catch {
      Alert.alert('Error', 'Could not verify your H‑E‑B connection. Please try again.');
      setState('webview');
    }
  }, [bridge]);

  const handleNavigationChange = useCallback(
    (navState: WebViewNavigation) => {
      setWebViewUrl(navState.url);
      const url = navState.url.toLowerCase();
      const isMainSite =
        url.includes('www.heb.com') &&
        !url.includes('sign-in') &&
        !url.includes('accounts.heb.com') &&
        !url.includes('account/sign-in');

      if (isMainSite && state === 'webview') {
        verifyLogin();
      }
    },
    [state, verifyLogin],
  );

  const handleDisconnect = () => {
    Alert.alert('Disconnect H‑E‑B', 'This will remove your H‑E‑B connection.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          bridge.reload();
          setState('prompt');
          setStoreName(null);
        },
      },
    ]);
  };

  if (state === 'checking') {
    return (
      <SafeAreaView style={styles.container}>
        <Header colors={colors} styles={styles} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.checkingText}>Checking connection...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'connected') {
    return (
      <SafeAreaView style={styles.container}>
        <Header colors={colors} styles={styles} />
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          <View style={styles.statusCard}>
            <AppIcon name="checkmark.circle.fill" size={48} color={colors.primary} />
            <Text style={styles.statusTitle}>Connected to H‑E‑B</Text>
            {storeName && (
              <View style={styles.storeRow}>
                <AppIcon name="storefront" size={16} color={colors.textSecondary} />
                <Text style={styles.storeLabel}>{storeName}</Text>
              </View>
            )}
          </View>

          <Button
            title="Reconnect"
            onPress={() => setState('webview')}
            variant="outline"
            style={styles.actionButton}
          />
          <Button
            title="Disconnect"
            onPress={handleDisconnect}
            variant="outline"
            style={styles.disconnectButton}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (state === 'prompt') {
    return (
      <SafeAreaView style={styles.container}>
        <Header colors={colors} styles={styles} />
        <View style={styles.content}>
          <View style={styles.promptCard}>
            <AppIcon name="storefront" size={48} color={colors.primary} />
            <Text style={styles.promptTitle}>Connect your H‑E‑B account</Text>
            <Text style={styles.promptDesc}>
              Sign in to your heb.com account to search for products and add items to your H‑E‑B cart.
            </Text>
            <Button
              title="Sign in to H‑E‑B"
              onPress={() => setState('webview')}
              style={styles.signInButton}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'verifying') {
    return (
      <SafeAreaView style={styles.container}>
        <Header colors={colors} styles={styles} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.checkingText}>Verifying your connection...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.webViewHeader}>
        <TouchableOpacity onPress={() => setState('prompt')} style={styles.backButton}>
          <AppIcon name="xmark" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.webViewHeaderTitle} numberOfLines={1}>
          Sign in to H‑E‑B
        </Text>
        <TouchableOpacity onPress={verifyLogin} style={styles.doneButton}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>

      <WebView
        ref={loginWebViewRef}
        source={{ uri: HEB_SIGN_IN_URL }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        onNavigationStateChange={handleNavigationChange}
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
        originWhitelist={['*']}
        style={styles.webView}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Header({ colors, styles }: { colors: ThemeColors; styles: any }) {
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

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2, borderBottomWidth: 1,
      borderBottomColor: colors.borderLight, backgroundColor: colors.surface,
    },
    backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, textAlign: 'center' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
    checkingText: { fontSize: fontSize.sm, color: colors.textSecondary },
    content: { flex: 1, padding: spacing.lg },

    statusCard: {
      backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.xl,
      alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg,
    },
    statusTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.text },
    storeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    storeLabel: { fontSize: fontSize.md, color: colors.textSecondary },
    actionButton: { marginBottom: spacing.sm },
    disconnectButton: { borderColor: colors.error },

    promptCard: {
      backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.xl,
      alignItems: 'center', gap: spacing.md,
    },
    promptTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, textAlign: 'center' },
    promptDesc: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
    signInButton: { width: '100%', marginTop: spacing.xs },

    webViewHeader: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm, borderBottomWidth: 1,
      borderBottomColor: colors.borderLight, backgroundColor: colors.surface,
    },
    webViewHeaderTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, textAlign: 'center' },
    doneButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    doneButtonText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
    webView: { flex: 1 },
    loadingOverlay: {
      ...StyleSheet.absoluteFill as object,
      backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center',
    },
  });
