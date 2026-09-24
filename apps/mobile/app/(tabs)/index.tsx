import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput as RNTextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Modal,
  ScrollView,
} from 'react-native';
import { AppIcon } from '@/components/AppIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMealPlan } from '@/hooks/useMealPlan';
import { api } from '@/lib/api';
import { useTheme, ThemeColors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CATEGORY_EMOJI: Record<string, string> = {
  produce: '🥬', meat: '🥩', seafood: '🐟', dairy: '🧀', bakery: '🍞',
  pantry: '🫙', frozen: '🧊', beverages: '🥤', spices: '🌶️', other: '📦',
};

// ─── Types ───

interface MealOption {
  title: string;
  description: string;
  estimatedTime: string;
  tags: string[];
}

interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  category: string;
}

interface RecipePreview {
  title: string;
  description: string;
  servings: number;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  instructions: string[];
  ingredients: RecipeIngredient[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: MealOption[];
  addedMeals?: string[];
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! 👋 I'm MealPilot \n\nTell me what you're in the mood for and I'll suggest some meals.\n\nFor example:\n• \"High-protein Italian meals for my family\"\n• \"Quick weeknight dinners under 30 min\"\n• \"Something fun and kid-friendly\"",
};

// ─── Main Screen ───

export default function PlanScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pvStyles = useMemo(() => createPvStyles(colors), [colors]);

  const {
    currentPlan,
    loading: planLoading,
    suggestMeals,
    addMealFromSuggestion,
    fetchLatestMealPlan,
    replaceMeal,
  } = useMealPlan();

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [addingMeal, setAddingMeal] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(true);
  const [nextDaySlot, setNextDaySlot] = useState(1);
  const flatListRef = useRef<FlatList>(null);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewSuggestion, setPreviewSuggestion] = useState<MealOption | null>(null);
  const [previewMessageId, setPreviewMessageId] = useState<string | null>(null);
  const [previewRecipe, setPreviewRecipe] = useState<RecipePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewAdded, setPreviewAdded] = useState(false);

  useEffect(() => {
    if (!currentPlan) fetchLatestMealPlan();
  }, []);

  useEffect(() => {
    if (currentPlan && messages.length <= 1) {
      setShowChat(false);
    }
    if (currentPlan) {
      const usedDays = new Set(currentPlan.meals.map((m) => m.day_of_week));
      for (let d = 1; d <= 6; d++) {
        if (!usedDays.has(d)) { setNextDaySlot(d); return; }
      }
      if (!usedDays.has(0)) { setNextDaySlot(0); return; }
      setNextDaySlot(1);
    }
  }, [currentPlan]);

  const getConversationHistory = useCallback(() => {
    return messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  const openPreview = useCallback(async (suggestion: MealOption, messageId: string) => {
    setPreviewSuggestion(suggestion);
    setPreviewMessageId(messageId);
    setPreviewRecipe(null);
    setPreviewLoading(true);
    setPreviewAdded(false);
    setPreviewVisible(true);

    try {
      const res = await api.post<{ recipe: RecipePreview }>('/api/chat/preview-recipe', {
        title: suggestion.title,
        description: suggestion.description,
      });
      setPreviewRecipe(res.recipe);
    } catch {
      Alert.alert('Error', 'Failed to load recipe details.');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleAddFromPreview = useCallback(async () => {
    if (!previewSuggestion || !previewMessageId) return;
    setAddingMeal(previewSuggestion.title);
    try {
      const plan = await addMealFromSuggestion(
        { title: previewSuggestion.title, description: previewSuggestion.description },
        nextDaySlot,
        'dinner',
      );

      setPreviewAdded(true);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === previewMessageId
            ? { ...msg, addedMeals: [...(msg.addedMeals ?? []), previewSuggestion!.title] }
            : msg
        )
      );

      const addedMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ Added "${previewSuggestion.title}" to ${DAY_NAMES_FULL[nextDaySlot]}!\n\n${plan.meals.length} meal${plan.meals.length === 1 ? '' : 's'} in your plan so far. Want more suggestions?`,
      };
      setMessages((prev) => [...prev, addedMsg]);
    } catch {
      Alert.alert('Error', 'Failed to add meal. Please try again.');
    } finally {
      setAddingMeal(null);
    }
  }, [previewSuggestion, previewMessageId, addMealFromSuggestion, nextDaySlot]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setChatLoading(true);

    const thinkingId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: thinkingId, role: 'assistant', content: '✨ Thinking...' },
    ]);

    try {
      const result = await suggestMeals(text, getConversationHistory());
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingId
            ? { ...msg, content: result.reply, suggestions: result.suggestions, addedMeals: [] }
            : msg
        )
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingId ? { ...msg, content: `❌ ${errorMsg}\n\nPlease try again.` } : msg
        )
      );
    } finally {
      setChatLoading(false);
    }
  };

  const handleAddMeal = useCallback(async (
    suggestion: MealOption,
    messageId: string,
  ) => {
    setAddingMeal(suggestion.title);
    try {
      const plan = await addMealFromSuggestion(
        { title: suggestion.title, description: suggestion.description },
        nextDaySlot,
        'dinner',
      );

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, addedMeals: [...(msg.addedMeals ?? []), suggestion.title] }
            : msg
        )
      );

      const addedMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ Added "${suggestion.title}" to ${DAY_NAMES_FULL[nextDaySlot]}!\n\n${plan.meals.length} meal${plan.meals.length === 1 ? '' : 's'} in your plan so far. Want more suggestions?`,
      };
      setMessages((prev) => [...prev, addedMsg]);
    } catch {
      Alert.alert('Error', 'Failed to add meal. Please try again.');
    } finally {
      setAddingMeal(null);
    }
  }, [addMealFromSuggestion, nextDaySlot]);

  const handleReplaceMeal = (mealId: string, mealTitle: string, dayOfWeek: number) => {
    Alert.alert(
      'Replace Meal',
      `Replace "${mealTitle}" on ${DAY_NAMES_FULL[dayOfWeek]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          onPress: async () => {
            if (currentPlan) await replaceMeal(currentPlan.id, mealId);
          },
        },
      ]
    );
  };

  const scrollToEnd = () => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const toggleChat = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowChat((prev) => !prev);
  }, []);

  const sortedMeals = currentPlan
    ? [...currentPlan.meals].sort((a, b) => a.day_of_week - b.day_of_week)
    : [];

  // ─── Render messages ───

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageGroup}>
      <View
        style={[
          styles.messageBubble,
          item.role === 'user' ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <Text
          style={[
            styles.messageText,
            item.role === 'user' ? styles.userText : styles.assistantText,
          ]}
        >
          {item.content}
        </Text>
      </View>

      {item.suggestions && item.suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {item.suggestions.map((s, idx) => {
            const isAdded = item.addedMeals?.includes(s.title);
            const isAdding = addingMeal === s.title;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.suggestionCard, isAdded && styles.suggestionCardAdded]}
                activeOpacity={0.7}
                onPress={() => openPreview(s, item.id)}
              >
                <View style={styles.suggestionInfo}>
                  <Text style={styles.suggestionTitle}>{s.title}</Text>
                  <Text style={styles.suggestionDesc} numberOfLines={2}>
                    {s.description}
                  </Text>
                  <View style={styles.suggestionMeta}>
                    {s.estimatedTime && (
                      <View style={styles.tagChip}>
                        <AppIcon name="timer" size={10} color={colors.textTertiary} />
                        <Text style={styles.tagText}>{s.estimatedTime}</Text>
                      </View>
                    )}
                    {s.tags?.slice(0, 2).map((tag, ti) => (
                      <View key={ti} style={styles.tagChip}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                {isAdded ? (
                  <View style={styles.addedBadge}>
                    <AppIcon name="checkmark.circle.fill" size={20} color={colors.primary} />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.addMealBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleAddMeal(s, item.id);
                    }}
                    disabled={isAdding || !!addingMeal}
                  >
                    {isAdding ? (
                      <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                      <AppIcon name="plus" size={16} color={colors.textInverse} />
                    )}
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>MealPilot</Text>
          {currentPlan && currentPlan.meals.length > 0 ? (
            <Text style={styles.headerSubtitle}>
              {currentPlan.meals.length} meal{currentPlan.meals.length === 1 ? '' : 's'} planned · {formatDate(currentPlan.week_start)}
            </Text>
          ) : (
            <Text style={styles.headerSubtitle}>Your meal planning assistant</Text>
          )}
        </View>
        {currentPlan && currentPlan.meals.length > 0 && (
          <TouchableOpacity onPress={toggleChat} style={styles.chatToggle}>
            <AppIcon
              name={showChat ? 'calendar' : 'text.bubble'}
              size={20}
              color={colors.primary}
            />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {showChat && (
          <View style={currentPlan && currentPlan.meals.length > 0 && !showChat ? styles.chatCollapsed : styles.chatFull}>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={scrollToEnd}
            />
          </View>
        )}

        {!showChat && currentPlan && sortedMeals.length > 0 && (
          <FlatList
            data={sortedMeals}
            renderItem={({ item }) => (
              <MealCard
                meal={item}
                onPress={() =>
                  router.push({
                    pathname: '/recipe/[id]',
                    params: {
                      id: item.recipe?.id ?? item.id,
                      mealId: item.id,
                      mealPlanId: currentPlan.id,
                      title: item.title,
                    },
                  })
                }
                onReplace={() => handleReplaceMeal(item.id, item.title, item.day_of_week)}
              />
            )}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.mealsList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListHeaderComponent={
              planLoading ? (
                <View style={styles.refreshBanner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.refreshText}>Updating...</Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              <TouchableOpacity style={styles.addMoreBtn} onPress={toggleChat}>
                <AppIcon name="plus" size={16} color={colors.primary} />
                <Text style={styles.addMoreText}>Add more meals</Text>
              </TouchableOpacity>
            }
          />
        )}

        {!showChat && (!currentPlan || sortedMeals.length === 0) && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <AppIcon name="calendar" size={48} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No meals planned yet</Text>
            <Text style={styles.emptyDesc}>
              Chat with MealPilot to discover meals you'll love!
            </Text>
            <TouchableOpacity style={styles.startButton} onPress={toggleChat}>
              <AppIcon name="text.bubble" size={16} color={colors.primary} />
              <Text style={styles.startText}>Start planning</Text>
            </TouchableOpacity>
          </View>
        )}

        {showChat && (
          <View style={styles.inputContainer}>
            <RNTextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="What are you in the mood for?"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={500}
              editable={!chatLoading}
              onSubmitEditing={sendMessage}
            />
            {chatLoading ? (
              <View style={styles.sendButton}>
                <ActivityIndicator size="small" color={colors.textInverse} />
              </View>
            ) : (
              <TouchableOpacity
                onPress={sendMessage}
                disabled={!input.trim()}
                style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
              >
                <AppIcon
                  name="paperplane.fill"
                  size={20}
                  color={!input.trim() ? colors.textTertiary : colors.textInverse}
                />
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ─── Recipe Preview Bottom Sheet ─── */}
      <Modal
        visible={previewVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={pvStyles.container}>
          <View style={pvStyles.header}>
            <TouchableOpacity
              style={pvStyles.closeBtn}
              onPress={() => setPreviewVisible(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppIcon name="xmark" size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={pvStyles.headerTitle} numberOfLines={1}>Recipe Preview</Text>
            <View style={{ width: 36 }} />
          </View>

          {previewLoading ? (
            <View style={pvStyles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={pvStyles.loadingText}>Generating recipe for</Text>
              <Text style={pvStyles.loadingTitle}>{previewSuggestion?.title}</Text>
            </View>
          ) : previewRecipe ? (
            <ScrollView style={pvStyles.scroll} contentContainerStyle={pvStyles.scrollContent} showsVerticalScrollIndicator={false}>
              <Text style={pvStyles.title}>{previewRecipe.title}</Text>
              <Text style={pvStyles.description}>{previewRecipe.description}</Text>

              <View style={pvStyles.statsRow}>
                {previewRecipe.prepTimeMinutes > 0 && (
                  <View style={pvStyles.stat}>
                    <AppIcon name="timer" size={14} color={colors.primary} />
                    <Text style={pvStyles.statLabel}>Prep</Text>
                    <Text style={pvStyles.statValue}>{previewRecipe.prepTimeMinutes} min</Text>
                  </View>
                )}
                {previewRecipe.cookTimeMinutes > 0 && (
                  <View style={pvStyles.stat}>
                    <AppIcon name="flame" size={14} color={colors.primary} />
                    <Text style={pvStyles.statLabel}>Cook</Text>
                    <Text style={pvStyles.statValue}>{previewRecipe.cookTimeMinutes} min</Text>
                  </View>
                )}
                {previewRecipe.servings > 0 && (
                  <View style={pvStyles.stat}>
                    <AppIcon name="person.2" size={14} color={colors.primary} />
                    <Text style={pvStyles.statLabel}>Serves</Text>
                    <Text style={pvStyles.statValue}>{previewRecipe.servings}</Text>
                  </View>
                )}
              </View>

              {previewSuggestion?.tags && previewSuggestion.tags.length > 0 && (
                <View style={pvStyles.tagsRow}>
                  {previewSuggestion.tags.map((tag, i) => (
                    <View key={i} style={pvStyles.tagChip}>
                      <Text style={pvStyles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={pvStyles.sectionTitle}>Ingredients</Text>
              <View style={pvStyles.ingredientsList}>
                {previewRecipe.ingredients.map((ing: RecipeIngredient, idx: number) => (
                  <View key={idx} style={pvStyles.ingredientRow}>
                    <Text style={pvStyles.ingredientEmoji}>
                      {CATEGORY_EMOJI[ing.category] ?? '📦'}
                    </Text>
                    <Text style={pvStyles.ingredientText}>
                      {ing.quantity != null && ing.quantity > 0 ? `${ing.quantity}` : ''}
                      {ing.unit ? ` ${ing.unit}` : ''} {ing.name}
                      {ing.notes ? ` (${ing.notes})` : ''}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={pvStyles.sectionTitle}>Instructions</Text>
              <View style={pvStyles.instructionsList}>
                {previewRecipe.instructions.map((step: string, idx: number) => (
                  <View key={idx} style={pvStyles.instructionRow}>
                    <View style={pvStyles.stepBadge}>
                      <Text style={pvStyles.stepNumber}>{idx + 1}</Text>
                    </View>
                    <Text style={pvStyles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>

              <View style={{ height: 100 }} />
            </ScrollView>
          ) : (
            <View style={pvStyles.centered}>
              <Text style={pvStyles.errorText}>Unable to load recipe.</Text>
            </View>
          )}

          {previewRecipe && (
            <View style={pvStyles.bottomBar}>
              {previewAdded ? (
                <View style={pvStyles.addedBar}>
                  <AppIcon name="checkmark.circle.fill" size={20} color={colors.primary} />
                  <Text style={pvStyles.addedBarText}>
                    Added to {DAY_NAMES_FULL[nextDaySlot]}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[pvStyles.addBtn, !!addingMeal && pvStyles.addBtnDisabled]}
                  onPress={handleAddFromPreview}
                  disabled={!!addingMeal}
                  activeOpacity={0.8}
                >
                  {addingMeal === previewSuggestion?.title ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <>
                      <AppIcon name="plus" size={18} color={colors.textInverse} />
                      <Text style={pvStyles.addBtnText}>
                        Add to Plan — {DAY_NAMES_FULL[nextDaySlot]}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Meal Card ───

interface MealCardProps {
  meal: {
    id: string;
    day_of_week: number;
    meal_type: string;
    title: string;
    description: string | null;
    recipe: { id?: string; prep_time_minutes: number | null; cook_time_minutes: number | null } | null;
  };
  onPress: () => void;
  onReplace: () => void;
}

function MealCard({ meal, onPress, onReplace }: MealCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const totalTime = (meal.recipe?.prep_time_minutes ?? 0) + (meal.recipe?.cook_time_minutes ?? 0);

  return (
    <TouchableOpacity style={styles.mealCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.mealCardHeader}>
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>{DAY_NAMES[meal.day_of_week]}</Text>
        </View>
        <Text style={styles.mealType}>{meal.meal_type}</Text>
        <TouchableOpacity onPress={onReplace} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <AppIcon name="arrow.clockwise" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      <Text style={styles.mealTitle}>{meal.title}</Text>
      {meal.description && (
        <Text style={styles.mealDescription} numberOfLines={2}>{meal.description}</Text>
      )}
      <View style={styles.mealMeta}>
        {totalTime > 0 && (
          <View style={styles.metaItem}>
            <AppIcon name="timer" size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>{totalTime} min</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <AppIcon name="chevron.right" size={14} color={colors.textTertiary} />
          <Text style={styles.metaText}>View recipe</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Styles ───

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
      borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.surface,
    },
    headerLeft: { flex: 1 },
    headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.primaryDark },
    headerSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
    chatToggle: {
      width: 40, height: 40, borderRadius: borderRadius.full,
      backgroundColor: colors.primaryLight + '15', alignItems: 'center', justifyContent: 'center',
    },
    body: { flex: 1 },
    chatFull: { flex: 1 },
    chatCollapsed: { maxHeight: 280 },
    messagesList: { padding: spacing.md, paddingBottom: spacing.sm },
    messageGroup: { marginBottom: spacing.sm },
    messageBubble: {
      maxWidth: '85%', paddingHorizontal: spacing.md, paddingVertical: spacing.md - 4,
      borderRadius: borderRadius.lg, marginBottom: 0,
    },
    userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: borderRadius.sm },
    assistantBubble: {
      alignSelf: 'flex-start', backgroundColor: colors.surface,
      borderBottomLeftRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.borderLight,
    },
    messageText: { fontSize: fontSize.md, lineHeight: 22 },
    userText: { color: colors.textInverse },
    assistantText: { color: colors.text },

    suggestionsContainer: { marginTop: spacing.sm, gap: spacing.sm },
    suggestionCard: {
      backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md,
      borderWidth: 1, borderColor: colors.borderLight, flexDirection: 'row', gap: spacing.sm,
    },
    suggestionCardAdded: { borderColor: colors.primary, backgroundColor: colors.primaryLight + '08' },
    suggestionInfo: { flex: 1 },
    suggestionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 4 },
    suggestionDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.xs },
    suggestionMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tagChip: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.sm,
      paddingVertical: 2, borderRadius: borderRadius.full,
    },
    tagText: { fontSize: fontSize.xs, color: colors.textTertiary },
    addMealBtn: {
      width: 36, height: 36, borderRadius: borderRadius.full, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    },
    addedBadge: { alignSelf: 'center', padding: spacing.xs },

    inputContainer: {
      flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    textInput: {
      flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: borderRadius.xl,
      paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, paddingBottom: spacing.sm + 2,
      fontSize: fontSize.md, color: colors.text, maxHeight: 100, marginRight: spacing.sm,
    },
    sendButton: {
      width: 40, height: 40, borderRadius: borderRadius.full,
      backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    },
    sendButtonDisabled: { backgroundColor: colors.surfaceSecondary },

    mealsList: { padding: spacing.md, paddingBottom: spacing.xxl },
    separator: { height: spacing.sm },
    refreshBanner: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: spacing.sm, paddingVertical: spacing.sm, marginBottom: spacing.sm,
    },
    refreshText: { fontSize: fontSize.sm, color: colors.textSecondary },
    mealCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md },
    mealCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
    dayBadge: {
      backgroundColor: colors.primary + '15', paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs, borderRadius: borderRadius.sm,
    },
    dayBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.primary },
    mealType: { flex: 1, fontSize: fontSize.xs, color: colors.textTertiary, textTransform: 'capitalize' },
    mealTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs },
    mealDescription: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
    mealMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    metaText: { fontSize: fontSize.xs, color: colors.textTertiary },
    addMoreBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      paddingVertical: spacing.md, marginTop: spacing.md,
      borderWidth: 1, borderColor: colors.primary + '40', borderStyle: 'dashed', borderRadius: borderRadius.md,
    },
    addMoreText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },

    emptyState: {
      flex: 1, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2,
    },
    emptyIcon: {
      width: 80, height: 80, borderRadius: borderRadius.full,
      backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    emptyTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm },
    emptyDesc: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
    startButton: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2, backgroundColor: colors.primaryLight + '15',
      borderRadius: borderRadius.full, gap: spacing.xs,
    },
    startText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
  });

// ─── Recipe Preview Styles ───

const createPvStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.surface,
    },
    closeBtn: {
      width: 36, height: 36, borderRadius: borderRadius.full,
      backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    loadingText: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: spacing.md },
    loadingTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginTop: spacing.xs, textAlign: 'center' },
    errorText: { fontSize: fontSize.md, color: colors.textSecondary },

    scroll: { flex: 1 },
    scrollContent: { padding: spacing.lg },

    title: { fontSize: 24, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
    description: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.md },

    statsRow: {
      flexDirection: 'row', gap: spacing.lg, paddingVertical: spacing.md,
      borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderLight, marginBottom: spacing.md,
    },
    stat: { alignItems: 'center', gap: 4 },
    statLabel: { fontSize: fontSize.xs, color: colors.textTertiary },
    statValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },

    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    tagChip: {
      backgroundColor: colors.primaryLight + '15', paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs, borderRadius: borderRadius.full,
    },
    tagText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },

    sectionTitle: {
      fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text,
      marginBottom: spacing.md, marginTop: spacing.sm,
    },

    ingredientsList: { gap: spacing.sm, marginBottom: spacing.lg },
    ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    ingredientEmoji: { fontSize: 16, width: 24, textAlign: 'center' },
    ingredientText: { flex: 1, fontSize: fontSize.md, color: colors.text, lineHeight: 22 },

    instructionsList: { gap: spacing.md },
    instructionRow: { flexDirection: 'row', gap: spacing.sm },
    stepBadge: {
      width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center', marginTop: 1,
    },
    stepNumber: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textInverse },
    stepText: { flex: 1, fontSize: fontSize.md, color: colors.text, lineHeight: 22 },

    bottomBar: {
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderTopWidth: 1, borderTopColor: colors.borderLight, backgroundColor: colors.surface,
    },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: colors.primary, paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
    },
    addBtnDisabled: { opacity: 0.6 },
    addBtnText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textInverse },
    addedBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    addedBarText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
  });
