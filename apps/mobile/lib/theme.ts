import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

// ─── Light Colors ───

const lightColors = {
  primary: '#2E7D32',
  primaryLight: '#4CAF50',
  primaryDark: '#1B5E20',
  accent: '#FF6F00',
  accentLight: '#FFA040',

  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceSecondary: '#F5F5F5',

  text: '#1A1A1A',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textInverse: '#FFFFFF',

  border: '#E0E0E0',
  borderLight: '#F0F0F0',

  success: '#2E7D32',
  warning: '#F57C00',
  error: '#D32F2F',
  info: '#1976D2',

  shadow: '#000000',
} as const;

// ─── Dark Colors ───

const darkColors = {
  primary: '#4CAF50',
  primaryLight: '#66BB6A',
  primaryDark: '#388E3C',
  accent: '#FFB74D',
  accentLight: '#FFCC80',

  background: '#121212',
  surface: '#1E1E1E',
  surfaceSecondary: '#2A2A2A',

  text: '#ECECEC',
  textSecondary: '#B0B0B0',
  textTertiary: '#707070',
  textInverse: '#121212',

  border: '#333333',
  borderLight: '#262626',

  success: '#66BB6A',
  warning: '#FFB74D',
  error: '#EF5350',
  info: '#42A5F5',

  shadow: '#000000',
} as const;

// ─── Theme Types ───

export type ThemeColors = {
  readonly [K in keyof typeof lightColors]: string;
};

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
}

// ─── Theme Context ───

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  console.log('[Theme] useColorScheme →', colorScheme);
  const isDark = colorScheme === 'dark';

  const value = useMemo(
    () => ({ colors: isDark ? darkColors : lightColors, isDark }),
    [isDark],
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  return useContext(ThemeContext);
}

// ─── Non-theme Constants (unchanged across themes) ───

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 34,
} as const;

export const borderRadius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};
