import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
} from 'react-native';
import { AppIcon } from '@/components/AppIcon';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { useMealPlan } from '@/hooks/useMealPlan';
import { useGrocery } from '@/hooks/useGrocery';
import { useHebBridge, type HebProduct, type HebCartItem } from '@/components/HebBridge';
import { useHeb } from '@/hooks/useHeb';
import { api } from '@/lib/api';
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

type CartView = 'groceries' | 'heb-cart';

interface GroceryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  in_pantry: boolean;
  checked: boolean;
}

export default function CartScreen() {
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
  const bridge = useHebBridge();
  const heb = useHeb();
  const [view, setView] = useState<CartView>('groceries');
  const [hebCart, setHebCart] = useState<HebCartItem[]>([]);
  const [hebTotal, setHebTotal] = useState<number | null>(null);
  const [hebItemCount, setHebItemCount] = useState(0);
  const [loadingCart, setLoadingCart] = useState(false);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);

  // Product picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerItem, setPickerItem] = useState<any>(null);
  const [pickerResults, setPickerResults] = useState<HebProduct[]>([]);
  const [pickerSearching, setPickerSearching] = useState(false);

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

  const handleMatchAll = useCallback(async () => {
    if (!currentPlan?.id) return;
    try {
      await heb.matchProducts(currentPlan.id);
      await heb.fetchMatches(currentPlan.id);
    } catch {
      Alert.alert('Error', 'Failed to match products.');
    }
  }, [currentPlan?.id, heb]);

  const handleLoadHebCart = useCallback(async () => {
    setLoadingCart(true);
    try {
      const cart = await bridge.getCart();
      setHebCart(cart.items);
      setHebTotal(cart.estimatedTotal);
      setHebItemCount(cart.itemCount);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load cart');
    } finally {
      setLoadingCart(false);
    }
  }, [bridge]);

  const handleUpdateCartQuantity = useCallback(async (item: HebCartItem, newQty: number) => {
    const key = `${item.productId}-${item.skuId}`;
    setUpdatingItem(key);
    try {
      const cart = newQty <= 0
        ? await bridge.removeFromCart(item.productId, item.skuId)
        : await bridge.updateCartItem(item.productId, item.skuId, newQty);
      setHebCart(cart.items);
      setHebTotal(cart.estimatedTotal);
      setHebItemCount(cart.itemCount);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setUpdatingItem(null);
    }
  }, [bridge]);

  const handleAddAllToCart = useCallback(async () => {
    const items = heb.itemsWithMatches
      .filter((i) => i.product_matches.length > 0 && i.product_matches[0].in_stock && !i.checked && !i.in_pantry)
      .map((i) => ({
        productId: i.product_matches[0].product_id,
        skuId: i.product_matches[0].sku_id,
        quantity: 1,
        groceryItemId: i.id,
      }));

    if (items.length === 0) {
      Alert.alert('No items', 'Match products first to add them to your H-E-B cart.');
      return;
    }

    Alert.alert(
      'Add to H‑E‑B Cart',
      `Add ${items.length} item${items.length === 1 ? '' : 's'} to your H‑E‑B cart?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add All',
          onPress: async () => {
            try {
              const result = await heb.addToCart(items);
              const succeeded = result.results.filter((r: any) => r.success).length;
              Alert.alert(
                'Added! 🛒',
                `${succeeded} item${succeeded === 1 ? '' : 's'} added.`,
                [{ text: 'View Cart', onPress: () => { setView('heb-cart'); handleLoadHebCart(); } }],
              );
            } catch {
              Alert.alert('Error', 'Failed to add items to cart.');
            }
          },
        },
      ],
    );
  }, [heb, handleLoadHebCart]);

  // Product picker
  const openProductPicker = useCallback(async (groceryItem: any) => {
    setPickerItem(groceryItem);
    setPickerVisible(true);
    setPickerSearching(true);
    try {
      const { products } = await bridge.searchProducts(groceryItem.name, 10);
      setPickerResults(products);
    } catch {
      setPickerResults([]);
    } finally {
      setPickerSearching(false);
    }
  }, [bridge]);

  const handlePickProduct = useCallback(async (product: HebProduct) => {
    if (!pickerItem) return;
    try {
      await api.put(`/api/grocery-items/${pickerItem.id}/match`, {
        productId: product.productId,
        skuId: product.skuId,
        productName: product.name,
        brand: product.brand,
        size: product.size,
        price: product.price,
        unitPrice: product.unitPrice,
        imageUrl: product.imageUrl,
        inStock: product.inStock,
      });
      if (currentPlan?.id) {
        await heb.fetchMatches(currentPlan.id);
      }
    } catch {
      Alert.alert('Error', 'Failed to update product match.');
    }
    setPickerVisible(false);
  }, [pickerItem, currentPlan?.id, heb]);

  // Group items by category
  const sections = useMemo(() => {
    if (!groceryList?.items.length) return [];

    const groups = new Map<string, GroceryItem[]>();
    for (const item of groceryList.items) {
      if (item.in_pantry) continue;
      const cat = item.category || 'other';
      const list = groups.get(cat) ?? [];
      list.push(item);
      groups.set(cat, list);
    }

    return CATEGORY_ORDER
      .filter((cat) => groups.has(cat))
      .map((cat) => ({
        title: CATEGORY_LABELS[cat] ?? cat,
        data: groups.get(cat)!,
      }));
  }, [groceryList?.items]);

  const matchMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of heb.itemsWithMatches) {
      map.set(item.id, item.product_matches[0] ?? null);
    }
    return map;
  }, [heb.itemsWithMatches]);

  const checkedCount = groceryList?.items.filter((i) => i.checked && !i.in_pantry).length ?? 0;
  const totalCount = groceryList?.items.filter((i) => !i.in_pantry).length ?? 0;
  const uncheckedCount = totalCount - checkedCount;
  const matchedCount = heb.itemsWithMatches.filter((i) => i.product_matches.length > 0 && !i.checked && !i.in_pantry).length;
  const hasMatches = matchedCount > 0;

  // ── No meal plan ──
  if (!currentPlan) {
    return (
      <ScreenContainer title="Cart">
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <AppIcon name="cart" size={48} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>No grocery list yet</Text>
          <Text style={styles.emptyDesc}>
            Create a meal plan first, then your grocery list and H‑E‑B cart will be here.
          </Text>
          <TouchableOpacity
            style={styles.goHomeButton}
            onPress={() => router.navigate('/(tabs)/')}
          >
            <AppIcon name="text.bubble" size={16} color={colors.primary} />
            <Text style={styles.goHomeText}>Start planning</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  // ── Has plan but no grocery list ──
  if (!groceryList && !loading) {
    return (
      <ScreenContainer title="Cart">
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <AppIcon name="list.bullet" size={48} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>Ready to build your list</Text>
          <Text style={styles.emptyDesc}>
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

  if (loading) {
    return (
      <ScreenContainer title="Cart">
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  // ── Main cart view ──
  return (
    <ScreenContainer title="Cart">
      {/* View toggle */}
      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, view === 'groceries' && styles.toggleBtnActive]}
          onPress={() => setView('groceries')}
        >
          <AppIcon
            name="list.bullet"
            size={16}
            color={view === 'groceries' ? colors.primary : colors.textTertiary}
          />
          <Text style={[styles.toggleText, view === 'groceries' && styles.toggleTextActive]}>
            Grocery List
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, view === 'heb-cart' && styles.toggleBtnActive]}
          onPress={() => {
            setView('heb-cart');
            if (hebCart.length === 0) handleLoadHebCart();
          }}
        >
          <AppIcon
            name="cart"
            size={16}
            color={view === 'heb-cart' ? colors.primary : colors.textTertiary}
          />
          <Text style={[styles.toggleText, view === 'heb-cart' && styles.toggleTextActive]}>
            H‑E‑B Cart
          </Text>
        </TouchableOpacity>
      </View>

      {view === 'groceries' ? (
        <>
          {/* Progress */}
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressText}>
                {hasMatches
                  ? `${matchedCount} of ${uncheckedCount} matched`
                  : `${checkedCount} of ${totalCount} checked off`}
              </Text>
              <TouchableOpacity onPress={() => router.push('/pantry')}>
                <Text style={styles.pantryNavText}>Pantry</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: hasMatches
                      ? (uncheckedCount > 0 ? `${(matchedCount / uncheckedCount) * 100}%` : '0%')
                      : (totalCount > 0 ? `${(checkedCount / totalCount) * 100}%` : '0%'),
                  },
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
              <GroceryItemRow
                item={item}
                match={matchMap.get(item.id)}
                onToggle={() => toggleItem(item.id)}
                onSwap={() => openProductPicker(item)}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={false}
          />

          {/* Footer actions */}
          <View style={styles.footer}>
            {!hasMatches ? (
              <>
                <Button
                  title="Regenerate"
                  onPress={handleGenerate}
                  variant="outline"
                  size="sm"
                  loading={generating}
                />
                {bridge.isAuthenticated ? (
                  <Button
                    title={heb.matching ? 'Matching...' : 'Match H‑E‑B Products'}
                    onPress={handleMatchAll}
                    loading={heb.matching}
                    size="sm"
                    style={styles.footerBtn}
                  />
                ) : (
                  <Button
                    title="Connect H‑E‑B"
                    onPress={() => router.push('/heb-connect')}
                    size="sm"
                    style={styles.footerBtn}
                  />
                )}
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.rematchBtn} onPress={handleMatchAll}>
                  <AppIcon name="arrow.clockwise" size={16} color={colors.primary} />
                  <Text style={styles.rematchText}>Re-match</Text>
                </TouchableOpacity>
                <Button
                  title={
                    heb.addingToCart ? 'Adding...'
                      : `Add ${matchedCount} to H‑E‑B Cart`
                  }
                  onPress={handleAddAllToCart}
                  loading={heb.addingToCart}
                  size="sm"
                  style={styles.footerBtn}
                />
              </>
            )}
          </View>
        </>
      ) : (
        /* H-E-B Cart view */
        <>
          {loadingCart ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading H‑E‑B cart...</Text>
            </View>
          ) : hebCart.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <AppIcon name="cart" size={48} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Cart is empty</Text>
              <Text style={styles.emptyDesc}>
                Match your grocery items to H‑E‑B products and add them to your cart.
              </Text>
              <Button
                title="View Grocery List"
                onPress={() => setView('groceries')}
                variant="outline"
                style={{ marginTop: spacing.md }}
              />
            </View>
          ) : (
            <>
              <View style={styles.cartSummary}>
                <Text style={styles.cartSummaryText}>
                  {hebItemCount} item{hebItemCount === 1 ? '' : 's'}
                  {hebTotal != null && ` · $${hebTotal.toFixed(2)}`}
                </Text>
                <TouchableOpacity onPress={handleLoadHebCart}>
                  <AppIcon name="arrow.clockwise" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={hebCart}
                keyExtractor={(item, idx) => `${item.productId}-${idx}`}
                renderItem={({ item }) => {
                  const key = `${item.productId}-${item.skuId}`;
                  const isUpdating = updatingItem === key;
                  return (
                    <View style={styles.hebCartItem}>
                      {item.imageUrl && (
                        <Image source={{ uri: item.imageUrl }} style={styles.hebCartImage} />
                      )}
                      <View style={styles.hebCartInfo}>
                        <Text style={styles.hebCartName} numberOfLines={2}>
                          {item.name || 'Unknown item'}
                        </Text>
                        {item.price != null && (
                          <Text style={styles.hebCartPrice}>${item.price.toFixed(2)}</Text>
                        )}
                      </View>
                      <View style={styles.qtyControls}>
                        {isUpdating ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => {
                                if (item.quantity <= 1) {
                                  handleUpdateCartQuantity(item, 0);
                                } else {
                                  handleUpdateCartQuantity(item, item.quantity - 1);
                                }
                              }}
                            >
                              <AppIcon
                                name={item.quantity <= 1 ? 'trash' : 'minus'}
                                size={14}
                                color={item.quantity <= 1 ? colors.error : colors.text}
                              />
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{item.quantity}</Text>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => handleUpdateCartQuantity(item, item.quantity + 1)}
                            >
                              <AppIcon name="plus" size={14} color={colors.text} />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                }}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            </>
          )}
        </>
      )}

      {/* Product Picker Bottom Sheet */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <View>
              <Text style={styles.pickerTitle}>Choose a product</Text>
              {pickerItem && (
                <Text style={styles.pickerSubtitle}>
                  {pickerItem.name}
                  {pickerItem.quantity ? ` · ${formatQty(pickerItem.quantity, pickerItem.unit)}` : ''}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setPickerVisible(false)} style={styles.pickerClose}>
              <AppIcon name="xmark" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {pickerSearching ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Searching H‑E‑B...</Text>
            </View>
          ) : pickerResults.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptyDesc}>
                Try searching on the H‑E‑B website for this ingredient.
              </Text>
            </View>
          ) : (
            <FlatList
              data={pickerResults}
              keyExtractor={(item) => `${item.productId}-${item.skuId}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerProduct}
                  onPress={() => handlePickProduct(item)}
                  activeOpacity={0.7}
                >
                  {item.imageUrl && (
                    <Image source={{ uri: item.imageUrl }} style={styles.pickerProductImage} />
                  )}
                  <View style={styles.pickerProductInfo}>
                    <Text style={styles.pickerProductName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {item.brand && (
                      <Text style={styles.pickerProductBrand}>{item.brand}</Text>
                    )}
                    <View style={styles.pickerProductRow}>
                      {item.price != null && (
                        <Text style={styles.pickerProductPrice}>
                          ${item.price.toFixed(2)}
                        </Text>
                      )}
                      {item.size && (
                        <Text style={styles.pickerProductSize}>{item.size}</Text>
                      )}
                      {!item.inStock && (
                        <View style={styles.outOfStockBadge}>
                          <Text style={styles.outOfStockText}>Out of stock</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <AppIcon name="chevron.right" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.pickerList}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={styles.pickerSep} />}
            />
          )}
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function GroceryItemRow({
  item,
  match,
  onToggle,
  onSwap,
}: {
  item: GroceryItem;
  match: any | null;
  onToggle: () => void;
  onSwap: () => void;
}) {
  return (
    <View style={styles.itemCard}>
      <TouchableOpacity
        style={styles.itemRow}
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
      </TouchableOpacity>

      {/* Matched product preview — only show for unchecked items */}
      {match && !item.checked && (
        <TouchableOpacity style={styles.matchPreview} onPress={onSwap} activeOpacity={0.7}>
          {match.image_url ? (
            <Image source={{ uri: match.image_url }} style={styles.matchImage} />
          ) : (
            <View style={[styles.matchImage, styles.matchImagePlaceholder]}>
              <AppIcon name="cart" size={14} color={colors.textTertiary} />
            </View>
          )}
          <View style={styles.matchInfo}>
            <Text style={styles.matchName} numberOfLines={1}>{match.product_name}</Text>
            <View style={styles.matchMeta}>
              {match.price != null && (
                <Text style={styles.matchPrice}>${match.price.toFixed(2)}</Text>
              )}
              {match.size && (
                <Text style={styles.matchSize}>{match.size}</Text>
              )}
            </View>
          </View>
          <View style={styles.swapBtn}>
            <Text style={styles.swapText}>Swap</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

function formatQty(quantity: number | null, unit: string | null): string {
  if (!quantity) return unit ?? '';
  const q = quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(1);
  return unit ? `${q} ${unit}` : q;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  loadingText: { fontSize: fontSize.sm, color: colors.textSecondary },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm,
  },
  emptyDesc: {
    fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22,
  },
  goHomeButton: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2, backgroundColor: colors.primaryLight + '15',
    borderRadius: borderRadius.full, gap: spacing.xs, marginTop: spacing.lg,
  },
  goHomeText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
  generateButton: { minWidth: 220 },
  pantryLink: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.xs },
  pantryLinkText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },

  // View toggle
  viewToggle: {
    flexDirection: 'row', backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md, padding: 3, marginBottom: spacing.md,
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm, borderRadius: borderRadius.sm + 2, gap: spacing.xs,
  },
  toggleBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
  },
  toggleText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textTertiary },
  toggleTextActive: { color: colors.primary },

  // Progress
  progressContainer: { marginBottom: spacing.md },
  progressHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
  pantryNavText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold },
  progressBar: {
    height: 6, backgroundColor: colors.borderLight, borderRadius: borderRadius.full, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: borderRadius.full },

  errorBanner: {
    backgroundColor: colors.error + '15', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: borderRadius.sm, marginBottom: spacing.md,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },

  sectionHeader: {
    fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text,
    paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  listContent: { paddingBottom: spacing.xxl },

  // Grocery item card
  itemCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    marginBottom: spacing.xs, overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, gap: spacing.sm,
  },
  itemContent: { flex: 1 },
  itemName: { fontSize: fontSize.md, color: colors.text },
  itemNameChecked: { textDecorationLine: 'line-through', color: colors.textTertiary },
  itemQty: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  itemQtyChecked: { color: colors.textTertiary },

  // Matched product preview
  matchPreview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    backgroundColor: colors.surfaceSecondary + '60',
  },
  matchImage: { width: 36, height: 36, borderRadius: borderRadius.sm, backgroundColor: colors.surfaceSecondary },
  matchImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  matchInfo: { flex: 1 },
  matchName: { fontSize: fontSize.sm, color: colors.text },
  matchMeta: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  matchPrice: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary },
  matchSize: { fontSize: fontSize.xs, color: colors.textTertiary },
  swapBtn: {
    backgroundColor: colors.primaryLight + '20', paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1, borderRadius: borderRadius.sm,
  },
  swapText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    backgroundColor: colors.surface, gap: spacing.md,
  },
  footerBtn: { flex: 1 },
  rematchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  rematchText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold },

  // H-E-B Cart
  cartSummary: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, marginBottom: spacing.sm,
  },
  cartSummaryText: {
    fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text,
  },
  hebCartItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.xs,
  },
  hebCartImage: { width: 48, height: 48, borderRadius: borderRadius.sm, backgroundColor: colors.surfaceSecondary },
  hebCartInfo: { flex: 1 },
  hebCartName: { fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium },
  hebCartPrice: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold, marginTop: 2 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  qtyBtn: {
    width: 30, height: 30, borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  qtyText: {
    fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text,
    minWidth: 24, textAlign: 'center',
  },

  // Product picker modal
  pickerContainer: { flex: 1, backgroundColor: colors.background },
  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  pickerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  pickerSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  pickerClose: { padding: spacing.xs },
  pickerList: { padding: spacing.md },
  pickerSep: { height: 1, backgroundColor: colors.borderLight },
  pickerProduct: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
  },
  pickerProductImage: { width: 56, height: 56, borderRadius: borderRadius.sm, backgroundColor: colors.surfaceSecondary },
  pickerProductInfo: { flex: 1 },
  pickerProductName: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.text },
  pickerProductBrand: { fontSize: fontSize.sm, color: colors.textTertiary, marginTop: 2 },
  pickerProductRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  pickerProductPrice: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary },
  pickerProductSize: { fontSize: fontSize.sm, color: colors.textTertiary },
  outOfStockBadge: {
    backgroundColor: colors.error + '15', paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  outOfStockText: { fontSize: fontSize.xs, color: colors.error, fontWeight: fontWeight.medium },
});
