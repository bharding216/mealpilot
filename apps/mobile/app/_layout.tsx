import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { MealPlanProvider } from '@/hooks/useMealPlan';
import { HebBridgeProvider } from '@/components/HebBridge';
import { ThemeProvider, useTheme } from '@/lib/theme';

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!session && !inAuthGroup) {
      router.replace('/auth/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  return <>{children}</>;
}

function ThemedStack() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationGuard>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        />
      </NavigationGuard>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MealPlanProvider>
          <HebBridgeProvider>
            <ThemedStack />
          </HebBridgeProvider>
        </MealPlanProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
