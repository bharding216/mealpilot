import React from 'react';
import { Platform, ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize } from '@/lib/theme';

const TAB_ICONS = {
  index: { sf: 'calendar', ionicon: 'calendar-outline' as const, sfFilled: 'calendar.badge.clock', ioniconFilled: 'calendar' as const },
  cookbook: { sf: 'book', ionicon: 'book-outline' as const, sfFilled: 'book.fill', ioniconFilled: 'book' as const },
  cart: { sf: 'cart', ionicon: 'cart-outline' as const, sfFilled: 'cart.fill', ioniconFilled: 'cart' as const },
  profile: { sf: 'person', ionicon: 'person-outline' as const, sfFilled: 'person.fill', ioniconFilled: 'person' as const },
} as const;

function TabIcon({ name, color, size, focused }: { name: keyof typeof TAB_ICONS; color: ColorValue; size: number; focused: boolean }) {
  const icons = TAB_ICONS[name];
  const colorStr = color as string;

  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={focused ? icons.sfFilled : icons.sf}
        size={size}
        tintColor={colorStr}
        weight="medium"
        style={{ width: size, height: size }}
      />
    );
  }

  return <Ionicons name={focused ? icons.ioniconFilled : icons.ionicon} size={size} color={colorStr} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderLight,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.xs,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="index" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="cookbook"
        options={{
          title: 'Cookbook',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="cookbook" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="cart" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="profile" color={color} size={size} focused={focused} />
          ),
        }}
      />
      {/* Hide old tabs that are being replaced */}
      <Tabs.Screen name="plan" options={{ href: null }} />
      <Tabs.Screen name="groceries" options={{ href: null }} />
    </Tabs>
  );
}
