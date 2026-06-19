import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { FormField } from '@/src/components/FormField';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { api } from '@/src/api/client';

export default function PhoneScreen() {
  const router = useRouter();
  const [mobile, setMobile] = useState('+91');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!/^\+?\d{7,15}$/.test(mobile.trim())) {
      setErr('Enter a valid mobile number');
      return;
    }
    try {
      setLoading(true);
      const r: any = await api('/auth/request-otp', { method: 'POST', body: { mobile_number: mobile.trim() }, auth: false });
      router.push({ pathname: '/onboarding/otp', params: { mobile: mobile.trim(), devCode: r.dev_code || '' } });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.body}>
          <View style={styles.logoCircle}>
            <Ionicons name="storefront" size={28} color={theme.color.brand} />
          </View>
          <Text style={styles.title}>Welcome to QuickStore</Text>
          <Text style={styles.subtitle}>Run your wholesale toy shop from your phone.</Text>
          <View style={{ height: 32 }} />
          <FormField
            testID="phone-input"
            label="Mobile number"
            placeholder="+91 90000 00000"
            keyboardType="phone-pad"
            value={mobile}
            onChangeText={setMobile}
            autoFocus
            error={err || undefined}
          />
          <Text style={styles.helper}>We&apos;ll send a 6-digit OTP to verify your number.</Text>
        </View>
        <View style={styles.footer}>
          <PrimaryButton testID="send-otp-btn" title="Send OTP" onPress={submit} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 32 },
  logoCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.color.brandTertiary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: theme.color.onSurface },
  subtitle: { fontSize: 15, color: theme.color.onSurfaceMuted, marginTop: 6 },
  helper: { fontSize: 12, color: theme.color.onSurfaceMuted, marginTop: -4 },
  footer: { padding: 20, paddingTop: 8 },
});
