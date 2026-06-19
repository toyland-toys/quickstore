import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { theme } from '@/src/theme';

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.color.brand} />
    </View>
  );
}
