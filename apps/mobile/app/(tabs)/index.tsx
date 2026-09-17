import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { AppIcon } from '@/components/AppIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMealPlan } from '@/hooks/useMealPlan';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '@/lib/theme';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mealPlanId?: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm MealPilot 🍽️\n\nTell me what your household wants to eat this week, and I'll create a meal plan for you.\n\nFor example:\n• \"Plan 5 dinners for next week\"\n• \"Healthy high-protein meals, nothing too complicated\"\n• \"Kid-friendly meals under $100 budget\"",
};

export default function HomeScreen() {
  const { createMealPlan, loading } = useMealPlan();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Add a "thinking" message
    const thinkingId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: thinkingId, role: 'assistant', content: '⏳ Creating your meal plan...' },
    ]);

    try {
      const mealPlan = await createMealPlan(text);

      // Build a summary from the meal plan
      const mealLines = mealPlan.meals
        .sort((a, b) => a.day_of_week - b.day_of_week)
        .map((m) => `${DAY_NAMES[m.day_of_week]}: ${m.title}`)
        .join('\n');

      const summary = `Here's your meal plan — "${mealPlan.title}":\n\n${mealLines}\n\nHead to the Meal Plan tab to see details, swap meals, or view recipes! 📋`;

      // Replace the thinking message
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingId
            ? { ...msg, content: summary, mealPlanId: mealPlan.id }
            : msg
        )
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingId
            ? { ...msg, content: `❌ ${errorMsg}\n\nPlease try again.` }
            : msg
        )
      );
    }
  };

  const scrollToEnd = () => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
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
      {item.mealPlanId && (
        <TouchableOpacity
          style={styles.viewPlanButton}
          onPress={() => router.navigate('/(tabs)/plan')}
        >
          <AppIcon name="calendar" size={14} color={colors.primary} />
          <Text style={styles.viewPlanText}>View Meal Plan</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MealPilot</Text>
        <Text style={styles.headerSubtitle}>Your meal planning assistant</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
        />

        <View style={styles.inputContainer}>
          <RNTextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="What do you want to eat this week?"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            editable={!loading}
            onSubmitEditing={sendMessage}
          />
          {loading ? (
            <View style={styles.sendButton}>
              <ActivityIndicator size="small" color={colors.textInverse} />
            </View>
          ) : (
            <TouchableOpacity
              onPress={sendMessage}
              disabled={!input.trim()}
              style={[
                styles.sendButton,
                !input.trim() && styles.sendButtonDisabled,
              ]}
            >
              <AppIcon
                name="paperplane.fill"
                size={20}
                color={!input.trim() ? colors.textTertiary : colors.textInverse}
              />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  messageBubble: {
    maxWidth: '85%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 4,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: borderRadius.sm,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomLeftRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  messageText: {
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  userText: {
    color: colors.textInverse,
  },
  assistantText: {
    color: colors.text,
  },
  viewPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.xs,
  },
  viewPlanText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm + 2,
    fontSize: fontSize.md,
    color: colors.text,
    maxHeight: 100,
    marginRight: spacing.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceSecondary,
  },
});
