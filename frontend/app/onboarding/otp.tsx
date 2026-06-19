import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/src/theme';
import { FormField } from '@/src/components/FormField';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { api, setToken } from '@/src/api/client';

export default function OtpScreen() {
  const router = useRouter();
  const { mobile, devCode } = useLocalSearchParams<{ mobile: string; devCode?: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const verify = async () => {
    setErr(null);
    if (!/^\d{6}$/.test(code)) {
      setErr('Enter the 6-digit code');
      return;
    }
    try {
      setLoading(true);
      const r: any = await api('/auth/verify-otp', { method: 'POST', body: { mobile_number: mobile, code }, auth: false });
      await setToken(r.token);
      if (!r.user.has_pin) router.replace('/onboarding/pin-setup');
      else if (!r.user.handle) router.replace('/onboarding/handle');
      else router.replace('/(tabs)');
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('invalid otp')) setErr('Wrong code. Try 123456 (DEV mode).');
      else if (msg.includes('internal') || msg.includes('500')) setErr('Server error. Please try again in a moment.');
      else setErr(e.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.body}>
          <Text style={styles.title}>Verify your number</Text>
          <Text style={styles.subtitle}>Code sent to {mobile}</Text>
          {devCode ? (
            <View style={styles.devChip}>
              <Text style={styles.devChipText}>DEV MODE — use code {devCode}</Text>
            </View>
          ) : null}
          <View style={{ height: 24 }} />
          <FormField
            testID="otp-input"
            label="6-digit code"
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            autoFocus
            error={err || undefined}
          />
        </View>
        <View style={styles.footer}>
          <PrimaryButton testID="verify-otp-btn" title="Verify & continue" onPress={verify} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 32 },
  title: { fontSize: 26, fontWeight: '700', color: theme.color.onSurface },
  subtitle: { fontSize: 14, color: theme.color.onSurfaceMuted, marginTop: 4 },
  devChip: { marginTop: 16, alignSelf: 'flex-start', backgroundColor: '#FBEFD0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  devChipText: { color: '#B27C12', fontWeight: '600', fontSize: 12 },
  footer: { padding: 20 },
});
