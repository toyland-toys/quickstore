import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { theme } from '../theme';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  testID?: string;
};

export function FormField({ label, error, style, testID, ...rest }: Props) {
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor="#A0A09D"
        style={[styles.input, error ? { borderColor: theme.color.error } : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginBottom: 6, fontWeight: '600' },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    fontSize: theme.font.lg,
    color: theme.color.onSurface,
  },
  error: { color: theme.color.error, fontSize: theme.font.sm, marginTop: 4 },
});
