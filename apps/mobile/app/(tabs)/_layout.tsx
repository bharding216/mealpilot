import React from 'react';
import { Platform, ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize } from '@/lib/theme';

const TAB_ICONS = {
  index: { sf: 'house', ionicon: 'home-outline' as const, sfFilled: 'house.fill', ioniconFilled: 'home' as const },
  plan: { sf: 'calendar', ionicon: 'calendar-outline' as const, sfFilled: 'calendar.badge.clock', ioniconFilled: 'calendar' as const },
  groceries: { sf: 'cart', ionicon: 'cart-outline' as const, sfFilled: 'cart.fill', ioniconFilled: 'cart' as const },
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
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="index" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Meal Plan',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="plan" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="groceries"
        options={{
          title: 'Groceries',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="groceries" color={color} size={size} focused={focused} />
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
    </Tabs>
  );
}
