import React from 'react';
import { Text, Pressable, StyleSheet, View, ActivityIndicator } from 'react-native';
import { theme } from '../theme';
import * as Haptics from 'expo-haptics';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  icon?: React.ReactNode;
};

export function PrimaryButton({ title, onPress, variant = 'primary', disabled, loading, testID, icon }: Props) {
  const isP = variant === 'primary';
  const isS = variant === 'secondary';
  const handle = () => {
    if (disabled || loading) return;
    Haptics.selectionAsync().catch(() => {});
    onPress();
  };
  return (
    <Pressable
      testID={testID}
      onPress={handle}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isP && styles.primary,
        isS && styles.secondary,
        variant === 'ghost' && styles.ghost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isP ? theme.color.onBrand : theme.color.brand} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text style={[styles.text, isP && { color: theme.color.onBrand }, isS && { color: theme.color.brand }, variant === 'ghost' && { color: theme.color.onSurface }]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: theme.color.brand },
  secondary: { backgroundColor: theme.color.brandTertiary },
  ghost: { backgroundColor: 'transparent' },
  text: { fontSize: theme.font.lg, fontWeight: '600' },
});
