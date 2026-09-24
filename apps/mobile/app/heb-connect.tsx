import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { useHebBridge } from '@/components/HebBridge';
import { useTheme, ThemeColors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

const HEB_SIGN_IN_URL = 'https://www.heb.com/account/sign-in';
const CART_HASH = 'c14a956d6d675f23e63f87511bf2ce03573e2f9de29db226dadb5dca9063d3f7';

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

          <CartTestSection />

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

// ─── Cart Test Section ───

interface SearchResult {
  productId: string;
  skuId: string;
  name: string;
  brand: string | null;
  size: string | null;
  price: number | null;
  imageUrl: string | null;
  inStock: boolean;
}

function CartTestSection() {
  const { colors } = useTheme();
  const ts = useMemo(() => createTestStyles(colors), [colors]);
  const bridge = useHebBridge();
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [cartTotal, setCartTotal] = useState<number | null>(null);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [loadingCart, setLoadingCart] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);

  const updateCartState = (cart: any) => {
    setCartItems(cart.items ?? []);
    setCartTotal(cart.estimatedTotal);
    setCartItemCount(cart.itemCount ?? cart.items?.length ?? 0);
  };

  const handleSearch = async (query: string) => {
    setSearching(true);
    try {
      const { products, raw } = await bridge.searchProducts(query, 5);
      console.log('[HEB Search]', query, '→', products.length, 'products');
      if (raw) console.log('[HEB Search Raw]', raw);
      setResults(products);
      if (products.length === 0) {
        Alert.alert('No Results', `No products found for "${query}". Check Expo logs for raw response.`);
      }
    } catch (err) {
      console.log('[HEB Search Error]', err);
      Alert.alert('Search Error', err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleAddToCart = async (product: SearchResult) => {
    setAdding(product.productId);
    try {
      const cart = await bridge.addToCart(product.productId, product.skuId, 1);
      updateCartState(cart);
      Alert.alert(
        'Added to Cart! 🛒',
        `${product.name}\n\nCart now has ${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}` +
          (cart.estimatedTotal != null ? `\nEstimated total: $${cart.estimatedTotal.toFixed(2)}` : ''),
      );
    } catch (err) {
      Alert.alert('Cart Error', err instanceof Error ? err.message : 'Failed to add to cart');
    } finally {
      setAdding(null);
    }
  };

  const handleUpdateQuantity = async (item: any, newQuantity: number) => {
    const key = `${item.productId}-${item.skuId}`;
    setUpdatingItem(key);
    try {
      if (newQuantity <= 0) {
        const cart = await bridge.removeFromCart(item.productId, item.skuId);
        updateCartState(cart);
      } else {
        const cart = await bridge.updateCartItem(item.productId, item.skuId, newQuantity);
        updateCartState(cart);
      }
    } catch (err) {
      Alert.alert('Cart Error', err instanceof Error ? err.message : 'Failed to update item');
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleRemoveItem = async (item: any) => {
    const key = `${item.productId}-${item.skuId}`;
    setUpdatingItem(key);
    try {
      const cart = await bridge.removeFromCart(item.productId, item.skuId);
      updateCartState(cart);
    } catch (err) {
      Alert.alert('Cart Error', err instanceof Error ? err.message : 'Failed to remove item');
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleViewCart = async () => {
    setLoadingCart(true);
    try {
      const cart = await bridge.getCart();
      updateCartState(cart);
      if (cart.items.length === 0) {
        Alert.alert('Cart Empty', 'Your H‑E‑B cart is empty.');
      }
    } catch (err) {
      Alert.alert('Cart Error', err instanceof Error ? err.message : 'Failed to load cart');
    } finally {
      setLoadingCart(false);
    }
  };

  return (
    <View style={ts.section}>
      <Text style={ts.sectionTitle}>🧪 Test H‑E‑B Integration</Text>

      <View style={ts.searchRow}>
        <TouchableOpacity style={ts.searchChip} onPress={() => handleSearch('milk')} disabled={searching}>
          <Text style={ts.chipText}>🥛 Search "milk"</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ts.searchChip} onPress={() => handleSearch('bread')} disabled={searching}>
          <Text style={ts.chipText}>🍞 Search "bread"</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ts.searchChip} onPress={() => handleSearch('chicken')} disabled={searching}>
          <Text style={ts.chipText}>🍗 Search "chicken"</Text>
        </TouchableOpacity>
      </View>

      {searching && (
        <View style={ts.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={ts.loadingText}>Searching...</Text>
        </View>
      )}

      {results.length > 0 && (
        <View style={ts.resultsList}>
          <Text style={ts.resultsLabel}>
            {results.length} product{results.length === 1 ? '' : 's'} found:
          </Text>
          {results.map((p) => (
            <View key={p.productId} style={ts.productCard}>
              {p.imageUrl && (
                <Image source={{ uri: p.imageUrl }} style={ts.productImage} />
              )}
              <View style={ts.productInfo}>
                <Text style={ts.productName} numberOfLines={2}>{p.name}</Text>
                {p.brand && <Text style={ts.productBrand}>{p.brand}</Text>}
                <View style={ts.productPriceRow}>
                  {p.price != null && <Text style={ts.productPrice}>${p.price.toFixed(2)}</Text>}
                  {p.size && <Text style={ts.productSize}>{p.size}</Text>}
                </View>
              </View>
              <TouchableOpacity
                style={[ts.addBtn, !p.inStock && ts.addBtnDisabled]}
                onPress={() => handleAddToCart(p)}
                disabled={adding !== null || !p.inStock}
              >
                {adding === p.productId ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <AppIcon name="plus" size={16} color={colors.textInverse} />
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={ts.viewCartBtn} onPress={handleViewCart} disabled={loadingCart}>
        {loadingCart ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <>
            <AppIcon name="cart" size={18} color={colors.primary} />
            <Text style={ts.viewCartText}>View H‑E‑B Cart</Text>
          </>
        )}
      </TouchableOpacity>

      {cartItems.length > 0 && (
        <View style={ts.cartSection}>
          <Text style={ts.cartTitle}>
            Cart ({cartItemCount} item{cartItemCount === 1 ? '' : 's'})
            {cartTotal != null && ` · $${cartTotal.toFixed(2)}`}
          </Text>
          {cartItems.map((item, idx) => {
            const itemKey = `${item.productId}-${item.skuId}`;
            const isUpdating = updatingItem === itemKey;
            return (
              <View key={`${item.productId}-${idx}`} style={ts.cartItem}>
                {item.imageUrl && (
                  <Image source={{ uri: item.imageUrl }} style={ts.cartItemImage} />
                )}
                <View style={ts.cartItemInfo}>
                  <Text style={ts.cartItemName} numberOfLines={2}>
                    {item.name || 'Unknown item'}
                  </Text>
                  {item.price != null && (
                    <Text style={ts.cartItemPrice}>${item.price.toFixed(2)}</Text>
                  )}
                </View>
                <View style={ts.qtyControls}>
                  {isUpdating ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={ts.qtyBtn}
                        onPress={() => {
                          if (item.quantity <= 1) {
                            handleRemoveItem(item);
                          } else {
                            handleUpdateQuantity(item, item.quantity - 1);
                          }
                        }}
                      >
                        <AppIcon
                          name={item.quantity <= 1 ? 'trash' : 'minus'}
                          size={14}
                          color={item.quantity <= 1 ? colors.error : colors.text}
                        />
                      </TouchableOpacity>
                      <Text style={ts.qtyText}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={ts.qtyBtn}
                        onPress={() => handleUpdateQuantity(item, item.quantity + 1)}
                      >
                        <AppIcon name="plus" size={14} color={colors.text} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const createTestStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.lg },
    sectionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md },
    searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
    searchChip: { backgroundColor: colors.primaryLight + '20', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
    chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.primary },
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
    loadingText: { fontSize: fontSize.sm, color: colors.textSecondary },
    resultsLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginBottom: spacing.sm },
    resultsList: { marginBottom: spacing.md },
    productCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    productImage: { width: 44, height: 44, borderRadius: borderRadius.sm, backgroundColor: colors.surfaceSecondary },
    productInfo: { flex: 1 },
    productName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
    productBrand: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 1 },
    productPriceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
    productPrice: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary },
    productSize: { fontSize: fontSize.xs, color: colors.textTertiary },
    addBtn: { width: 32, height: 32, borderRadius: borderRadius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    addBtnDisabled: { backgroundColor: colors.textTertiary },
    viewCartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2, borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.md, marginBottom: spacing.sm },
    viewCartText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
    cartSection: { marginTop: spacing.sm },
    cartTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
    cartItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    cartItemImage: { width: 44, height: 44, borderRadius: borderRadius.sm, backgroundColor: colors.surfaceSecondary },
    cartItemInfo: { flex: 1 },
    cartItemName: { fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium },
    cartItemPrice: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold, marginTop: 2 },
    qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    qtyBtn: { width: 30, height: 30, borderRadius: borderRadius.sm, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
    qtyText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text, minWidth: 24, textAlign: 'center' },
  });

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
