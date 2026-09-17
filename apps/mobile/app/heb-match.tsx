import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { useHeb } from '@/hooks/useHeb';
import { useMealPlan } from '@/hooks/useMealPlan';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

interface MatchedItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  product_matches: Array<{
    id: string;
    product_id: string;
    sku_id: string;
    product_name: string;
    brand: string | null;
    size: string | null;
    price: number | null;
    unit_price: string | null;
    image_url: string | null;
    in_stock: boolean;
    status: string;
  }>;
}

export default function HebMatchScreen() {
  const { mealPlanId } = useLocalSearchParams<{ mealPlanId: string }>();
  const { currentPlan } = useMealPlan();
  const {
    session,
    itemsWithMatches,
    matching,
    addingToCart,
    error,
    checkSession,
    matchProducts,
    fetchMatches,
    addToCart,
  } = useHeb();

  const [loading, setLoading] = useState(true);

  const planId = mealPlanId ?? currentPlan?.id;

  useEffect(() => {
    async function init() {
      const s = await checkSession();
      if (s.connected && planId) {
        await fetchMatches(planId);
      }
      setLoading(false);
    }
    init();
  }, [planId]);

  const handleMatch = async () => {
    if (!planId) return;
    try {
      await matchProducts(planId);
      await fetchMatches(planId);
    } catch {
      Alert.alert('Error', 'Failed to match products. Please try again.');
    }
  };

  const handleAddAllToCart = async () => {
    const itemsToAdd = itemsWithMatches
      .filter((item) => item.product_matches.length > 0 && item.product_matches[0].in_stock)
      .map((item) => ({
        productId: item.product_matches[0].product_id,
        skuId: item.product_matches[0].sku_id,
        quantity: 1,
        groceryItemId: item.id,
      }));

    if (itemsToAdd.length === 0) {
      Alert.alert('No items', 'No matched products to add to cart.');
      return;
    }

    Alert.alert(
      'Add to H‑E‑B Cart',
      `Add ${itemsToAdd.length} item${itemsToAdd.length === 1 ? '' : 's'} to your H‑E‑B cart?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add to Cart',
          onPress: async () => {
            try {
              const result = await addToCart(itemsToAdd);
              const succeeded = result.results.filter((r) => r.success).length;
              const failed = result.results.filter((r) => !r.success).length;

              if (failed === 0) {
                Alert.alert(
                  'Added to Cart! 🛒',
                  `${succeeded} item${succeeded === 1 ? '' : 's'} added to your H‑E‑B cart.${
                    result.cart?.estimatedTotal
                      ? `\n\nEstimated total: $${result.cart.estimatedTotal.toFixed(2)}`
                      : ''
                  }`,
                  [{ text: 'OK', onPress: () => fetchMatches(planId!) }]
                );
              } else {
                Alert.alert(
                  'Partially Added',
                  `${succeeded} added, ${failed} failed. Check product availability.`,
                  [{ text: 'OK', onPress: () => fetchMatches(planId!) }]
                );
              }
            } catch {
              Alert.alert('Error', 'Failed to add items to cart.');
            }
          },
        },
      ]
    );
  };

  // Not connected
  if (!loading && !session?.connected) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <AppIcon name="storefront" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>Connect your H‑E‑B account</Text>
          <Text style={styles.emptyDesc}>
            Link your H‑E‑B account to match grocery items to real products and add them to your cart.
          </Text>
          <Button
            title="Connect H‑E‑B"
            onPress={() => router.push('/heb-connect')}
            style={styles.connectButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // No matches yet
  if (itemsWithMatches.length === 0 || itemsWithMatches.every((i) => i.product_matches.length === 0)) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <AppIcon name="cart" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>Match to H‑E‑B Products</Text>
          <Text style={styles.emptyDesc}>
            Search H‑E‑B for each ingredient on your grocery list and find the best products.
          </Text>
          <Button
            title={matching ? 'Matching...' : 'Find H‑E‑B Products'}
            onPress={handleMatch}
            loading={matching}
            style={styles.connectButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  const matchedCount = itemsWithMatches.filter((i) => i.product_matches.length > 0).length;
  const inCartCount = itemsWithMatches.filter(
    (i) => i.product_matches.some((m) => m.status === 'in_cart')
  ).length;
  const estimatedTotal = itemsWithMatches.reduce((sum, item) => {
    const match = item.product_matches[0];
    return sum + (match?.price ?? 0);
  }, 0);

  return (
    <SafeAreaView style={styles.container}>
      <Header />

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View>
          <Text style={styles.summaryTitle}>
            {matchedCount} of {itemsWithMatches.length} matched
          </Text>
          {estimatedTotal > 0 && (
            <Text style={styles.summarySubtitle}>
              Est. total: ${estimatedTotal.toFixed(2)}
            </Text>
          )}
        </View>
        {session?.store && (
          <View style={styles.storeBadge}>
            <AppIcon name="storefront" size={12} color={colors.primary} />
            <Text style={styles.storeText} numberOfLines={1}>{session.store.name}</Text>
          </View>
        )}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={itemsWithMatches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MatchedItemRow item={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Footer actions */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.rematchButton} onPress={handleMatch}>
          <AppIcon name="arrow.clockwise" size={16} color={colors.primary} />
          <Text style={styles.rematchText}>Re-match</Text>
        </TouchableOpacity>
        <Button
          title={
            addingToCart
              ? 'Adding...'
              : inCartCount === matchedCount
                ? 'All in Cart ✓'
                : `Add ${matchedCount - inCartCount} to H‑E‑B Cart`
          }
          onPress={handleAddAllToCart}
          loading={addingToCart}
          disabled={inCartCount === matchedCount}
          style={styles.addButton}
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
      <Text style={styles.headerTitle}>H‑E‑B Products</Text>
      <View style={styles.backButton} />
    </View>
  );
}

function MatchedItemRow({ item }: { item: MatchedItem }) {
  const match = item.product_matches[0];
  const isInCart = match?.status === 'in_cart';

  return (
    <View style={[styles.itemCard, isInCart && styles.itemCardInCart]}>
      <View style={styles.ingredientRow}>
        <Text style={styles.ingredientName}>{item.name}</Text>
        {item.quantity && (
          <Text style={styles.ingredientQty}>
            {item.quantity}{item.unit ? ` ${item.unit}` : ''}
          </Text>
        )}
      </View>

      {match ? (
        <View style={styles.productRow}>
          {match.image_url ? (
            <Image source={{ uri: match.image_url }} style={styles.productImage} />
          ) : (
            <View style={[styles.productImage, styles.productImagePlaceholder]}>
              <AppIcon name="cart" size={20} color={colors.textTertiary} />
            </View>
          )}
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={2}>
              {match.product_name}
            </Text>
            <View style={styles.productMeta}>
              {match.brand && (
                <Text style={styles.productBrand}>{match.brand}</Text>
              )}
              {match.size && (
                <Text style={styles.productSize}>{match.size}</Text>
              )}
            </View>
            <View style={styles.productPriceRow}>
              {match.price != null && (
                <Text style={styles.productPrice}>${match.price.toFixed(2)}</Text>
              )}
              {match.unit_price && (
                <Text style={styles.productUnitPrice}>{match.unit_price}</Text>
              )}
              {!match.in_stock && (
                <View style={styles.outOfStockBadge}>
                  <Text style={styles.outOfStockText}>Out of stock</Text>
                </View>
              )}
              {isInCart && (
                <View style={styles.inCartBadge}>
                  <AppIcon name="checkmark.circle.fill" size={14} color={colors.primary} />
                  <Text style={styles.inCartText}>In cart</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.noMatchRow}>
          <AppIcon name="xmark.circle" size={16} color={colors.textTertiary} />
          <Text style={styles.noMatchText}>No match found</Text>
        </View>
      )}
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyDesc: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  connectButton: { minWidth: 200, marginTop: spacing.sm },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  summaryTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  summarySubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  storeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: 4,
    maxWidth: 160,
  },
  storeText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium },
  errorBanner: {
    backgroundColor: colors.error + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  listContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  separator: { height: spacing.sm },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  itemCardInCart: { opacity: 0.7 },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  ingredientName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, flex: 1 },
  ingredientQty: { fontSize: fontSize.sm, color: colors.textSecondary, marginLeft: spacing.sm },
  productRow: { flexDirection: 'row', gap: spacing.sm },
  productImage: { width: 56, height: 56, borderRadius: borderRadius.sm, backgroundColor: colors.surfaceSecondary },
  productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productInfo: { flex: 1 },
  productName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text, lineHeight: 18 },
  productMeta: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  productBrand: { fontSize: fontSize.xs, color: colors.textTertiary },
  productSize: { fontSize: fontSize.xs, color: colors.textTertiary },
  productPriceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  productPrice: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary },
  productUnitPrice: { fontSize: fontSize.xs, color: colors.textTertiary },
  outOfStockBadge: {
    backgroundColor: colors.error + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  outOfStockText: { fontSize: fontSize.xs, color: colors.error, fontWeight: fontWeight.medium },
  inCartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primaryLight + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  inCartText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium },
  noMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  noMatchText: { fontSize: fontSize.sm, color: colors.textTertiary },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  rematchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rematchText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold },
  addButton: { flex: 1 },
});
