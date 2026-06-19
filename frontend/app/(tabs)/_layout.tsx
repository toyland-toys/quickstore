import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: '#9A9A98',
        tabBarStyle: { backgroundColor: theme.color.surfaceSecondary, borderTopColor: theme.color.border, height: 78, paddingTop: 8, paddingBottom: 22 },
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
