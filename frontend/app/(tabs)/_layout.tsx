import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // Additive, never shrinking: the base 78/8/22 sizing is the original,
  // known-good layout (plenty of room for icon + label on every device that
  // has no safe-area inset, which is most Android phones and any desktop/
  // emulator). insets.bottom is added on top of that floor so a device with a
  // home-indicator (notched iPhones) gets extra clearance, instead of
  // insets.bottom *replacing* the padding and shrinking the bar below that
  // known-good size on every device that reports no inset.
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
          paddingBottom: 22 + insetBottom,
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
