import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, ThemeColors, spacing, fontSize, fontWeight } from '@/lib/theme';

interface ScreenContainerProps {
  children: React.ReactNode;
  title?: string;
  scrollable?: boolean;
  keyboardAvoiding?: boolean;
  style?: ViewStyle;
}

export function ScreenContainer({
  children,
  title,
  scrollable = false,
  keyboardAvoiding = false,
  style,
}: ScreenContainerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const content = (
    <View style={[styles.inner, style]}>
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );

  const scrollContent = scrollable ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  ) : (
    content
  );

  const body = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {scrollContent}
    </KeyboardAvoidingView>
  ) : (
    scrollContent
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {body}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    inner: {
      flex: 1,
      paddingHorizontal: spacing.lg,
    },
    scrollContent: {
      flexGrow: 1,
    },
    title: {
      fontSize: fontSize.xxl,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
  });
