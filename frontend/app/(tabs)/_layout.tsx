import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // height:78/paddingTop:8 unchanged from the original; paddingBottom dropped
  // from 22 to 12 -- confirmed by direct inspection that the label/icon were
  // being clipped by insufficient room inside the fixed-height bar (78 - 8 -
  // 22 = 48px of content room), not by anything overlapping it from outside.
  // 78 - 8 - 12 = 58px fixed that. insets.bottom is still added on top so a
  // device with a home indicator (notched iPhones) gets extra clearance
  // beyond this, without shrinking the base that fixed the clipping.
  const insetBottom = Math.max(0, insets.bottom);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: '#9A9A98',
        tabBarStyle: {
          backgroundColor: theme.color.surfaceSecondary,
          borderTopColor: theme.color.border,
          height: 78 + insetBottom,
          paddingTop: 8,
          paddingBottom: 12 + insetBottom,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Catalog',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'pricetags' : 'pricetags-outline'} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: 'Store',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'storefront' : 'storefront-outline'} size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
