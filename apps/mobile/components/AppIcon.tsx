import React from 'react';
import { Platform } from 'react-native';
import { SymbolView, SymbolViewProps, SFSymbol } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';

/**
 * Maps our icon names to SF Symbol names (iOS) and Ionicons names (Android fallback).
 */
const ICON_MAP: Record<string, { sf: SFSymbol; ionicon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  // Tab bar
  'house':           { sf: 'house',                    ionicon: 'home-outline' },
  'house.fill':      { sf: 'house.fill',               ionicon: 'home' },
  'calendar':        { sf: 'calendar',                  ionicon: 'calendar-outline' },
  'calendar.fill':   { sf: 'calendar.badge.clock',      ionicon: 'calendar' },
  'cart':            { sf: 'cart',                      ionicon: 'cart-outline' },
  'cart.fill':       { sf: 'cart.fill',                 ionicon: 'cart' },
  'person':          { sf: 'person',                    ionicon: 'person-outline' },
  'person.fill':     { sf: 'person.fill',               ionicon: 'person' },

  // Navigation & actions
  'chevron.right':   { sf: 'chevron.right',             ionicon: 'chevron-forward' },
  'chevron.left':    { sf: 'chevron.left',              ionicon: 'chevron-back' },
  'arrow.left':      { sf: 'arrow.left',                ionicon: 'arrow-back' },
  'arrow.clockwise': { sf: 'arrow.clockwise',           ionicon: 'refresh-outline' },
  'paperplane':      { sf: 'paperplane',                ionicon: 'send' },
  'paperplane.fill': { sf: 'paperplane.fill',           ionicon: 'send' },
  'xmark':           { sf: 'xmark',                     ionicon: 'close' },
  'xmark.circle':    { sf: 'xmark.circle',              ionicon: 'close-circle-outline' },
  'plus':            { sf: 'plus',                      ionicon: 'add' },
  'minus':           { sf: 'minus',                     ionicon: 'remove' },
  'trash':           { sf: 'trash',                     ionicon: 'trash-outline' },

  // Content
  'sparkles':        { sf: 'sparkles',                  ionicon: 'sparkles' },
  'timer':           { sf: 'timer',                     ionicon: 'timer-outline' },
  'flame':           { sf: 'flame',                     ionicon: 'flame-outline' },
  'person.2':        { sf: 'person.2',                  ionicon: 'people-outline' },
  'bubble.left':     { sf: 'bubble.left',               ionicon: 'chatbubble-outline' },
  'list.bullet':     { sf: 'list.bullet',               ionicon: 'list-outline' },
  'tray':            { sf: 'tray',                      ionicon: 'file-tray-outline' },
  'storefront':      { sf: 'storefront',                ionicon: 'storefront-outline' },
  'slider.horizontal.3': { sf: 'slider.horizontal.3',   ionicon: 'options-outline' },
  'book':            { sf: 'book',                      ionicon: 'book-outline' },
  'book.fill':       { sf: 'book.fill',                 ionicon: 'book' },
  'magnifyingglass': { sf: 'magnifyingglass',           ionicon: 'search-outline' },
  'text.bubble':     { sf: 'text.bubble',               ionicon: 'chatbubble-ellipses-outline' },
  'arrow.up':        { sf: 'arrow.up',                  ionicon: 'arrow-up' },
  'arrow.down':      { sf: 'arrow.down',                ionicon: 'arrow-down' },

  // Preferences
  'leaf':            { sf: 'leaf',                      ionicon: 'nutrition-outline' },
  'heart':           { sf: 'heart',                     ionicon: 'heart-outline' },
  'heart.fill':      { sf: 'heart.fill',                ionicon: 'heart' },
  'wallet':          { sf: 'wallet.bifold',             ionicon: 'wallet-outline' },

  // Checkboxes
  'checkmark.square.fill': { sf: 'checkmark.square.fill', ionicon: 'checkbox' },
  'square':                { sf: 'square',                 ionicon: 'square-outline' },
  'checkmark.circle.fill': { sf: 'checkmark.circle.fill', ionicon: 'checkmark-circle' },
  'circle':                { sf: 'circle',                 ionicon: 'radio-button-off' },
  'circle.fill':           { sf: 'circle.inset.filled',    ionicon: 'radio-button-on' },
};

interface AppIconProps {
  name: string;
  size?: number;
  color?: string;
  weight?: SymbolViewProps['weight'];
}

/**
 * Renders an SF Symbol on iOS, falls back to Ionicons on Android.
 */
export function AppIcon({ name, size = 22, color = '#000000', weight = 'medium' }: AppIconProps) {
  const mapping = ICON_MAP[name];

  if (Platform.OS === 'ios' && mapping) {
    return (
      <SymbolView
        name={mapping.sf}
        size={size}
        tintColor={color}
        weight={weight}
        style={{ width: size, height: size }}
      />
    );
  }

  // Android / unmapped fallback
  const iconName = mapping?.ionicon ?? (name as any);
  return <Ionicons name={iconName} size={size} color={color} />;
}
