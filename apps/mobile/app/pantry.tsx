import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput } from '@/components/TextInput';
import { Button } from '@/components/Button';
import { useGrocery } from '@/hooks/useGrocery';
import { useTheme, ThemeColors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

const COMMON_PANTRY_ITEMS = [
  { name: 'Salt', category: 'spices' },
  { name: 'Black pepper', category: 'spices' },
  { name: 'Olive oil', category: 'pantry' },
  { name: 'Vegetable oil', category: 'pantry' },
  { name: 'Butter', category: 'dairy' },
  { name: 'Garlic', category: 'produce' },
  { name: 'Onion', category: 'produce' },
  { name: 'Rice', category: 'pantry' },
  { name: 'Flour', category: 'pantry' },
  { name: 'Sugar', category: 'pantry' },
  { name: 'Soy sauce', category: 'pantry' },
  { name: 'Chicken broth', category: 'pantry' },
  { name: 'Eggs', category: 'dairy' },
  { name: 'Milk', category: 'dairy' },
  { name: 'Pasta', category: 'pantry' },
  { name: 'Canned tomatoes', category: 'pantry' },
  { name: 'Cumin', category: 'spices' },
  { name: 'Paprika', category: 'spices' },
  { name: 'Chili powder', category: 'spices' },
  { name: 'Italian seasoning', category: 'spices' },
];

export default function PantryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { pantryItems, fetchPantry, addPantryItem, removePantryItem } = useGrocery();
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchPantry().finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    const name = newItem.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addPantryItem(name);
      setNewItem('');
    } catch {
      Alert.alert('Error', 'Failed to add item');
    } finally {
      setAdding(false);
    }
  };

  const handleQuickAdd = async (name: string, category: string) => {
    if (pantryItems.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
    try {
      await addPantryItem(name, category);
    } catch {
      Alert.alert('Error', 'Failed to add item');
    }
  };

  const handleRemove = (id: string, name: string) => {
    Alert.alert('Remove', `Remove "${name}" from pantry?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePantryItem(id) },
    ]);
  };

  const pantryNames = new Set(pantryItems.map((p) => p.name.toLowerCase()));
  const suggestions = COMMON_PANTRY_ITEMS.filter(
    (item) => !pantryNames.has(item.name.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <AppIcon name="arrow.left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pantry</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.content}>
        <Text style={styles.description}>
          Items in your pantry will be marked separately on your grocery list so you
          know what you already have.
        </Text>

        <View style={styles.addRow}>
          <View style={styles.addInputWrap}>
            <TextInput
              placeholder="Add a pantry item..."
              value={newItem}
              onChangeText={setNewItem}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
          </View>
          <Button
            title="Add"
            onPress={handleAdd}
            size="sm"
            loading={adding}
            disabled={!newItem.trim()}
          />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={pantryItems}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              pantryItems.length > 0 ? (
                <Text style={styles.sectionLabel}>
                  Your pantry ({pantryItems.length} items)
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.pantryRow}>
                <AppIcon name="checkmark.circle.fill" size={20} color={colors.primary} />
                <Text style={styles.pantryName}>{item.name}</Text>
                <TouchableOpacity
                  onPress={() => handleRemove(item.id, item.name)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <AppIcon name="xmark.circle" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No pantry items yet. Add some below!</Text>
            }
            ListFooterComponent={
              suggestions.length > 0 ? (
                <View style={styles.suggestionsSection}>
                  <Text style={styles.sectionLabel}>Quick add common items</Text>
                  <View style={styles.chipGrid}>
                    {suggestions.map((item) => (
                      <TouchableOpacity
                        key={item.name}
                        style={styles.chip}
                        onPress={() => handleQuickAdd(item.name, item.category)}
                      >
                        <AppIcon name="plus" size={14} color={colors.primary} />
                        <Text style={styles.chipText}>{item.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      color: colors.text,
      textAlign: 'center',
    },
    content: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    description: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: spacing.md,
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    addInputWrap: {
      flex: 1,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sectionLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    pantryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: borderRadius.sm,
      marginBottom: spacing.xs,
      gap: spacing.sm,
    },
    pantryName: {
      flex: 1,
      fontSize: fontSize.md,
      color: colors.text,
    },
    emptyText: {
      fontSize: fontSize.md,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
    suggestionsSection: {
      marginTop: spacing.lg,
    },
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: borderRadius.full,
      gap: spacing.xs,
    },
    chipText: {
      fontSize: fontSize.sm,
      color: colors.primary,
      fontWeight: fontWeight.medium,
    },
    listContent: {
      paddingBottom: spacing.xxl,
    },
  });
