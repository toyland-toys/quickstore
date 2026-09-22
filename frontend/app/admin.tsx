import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { FormField } from '@/src/components/FormField';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { api, getAdminPin, setAdminPin } from '@/src/api/client';

export default function Admin() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState('');
  const [provider, setProvider] = useState<'dev' | 'twilio'>('dev');
  const [twilioConfigured, setTwilioConfigured] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [togglingProvider, setTogglingProvider] = useState(false);

  const login = async () => {
    setErr(null);
    try {
      setLoading(true);
      await api('/admin/login', { method: 'POST', auth: false, body: { pin } });
      await setAdminPin(pin);
      const s = await api<{ otp_provider: 'dev' | 'twilio'; twilio_configured: boolean }>('/admin/settings', {
        auth: false,
        headers: { 'x-admin-pin': pin },
      });
      setProvider(s.otp_provider);
      setTwilioConfigured(s.twilio_configured);
      setAuthed(true);
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  const toggleProvider = async (value: boolean) => {
    const next = value ? 'twilio' : 'dev';
    if (next === 'twilio' && !twilioConfigured) {
      Alert.alert(
        'Twilio not configured',
        "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER on the backend, then try again."
      );
      return;
    }
    const p = await getAdminPin();
    try {
      setTogglingProvider(true);
      await api('/admin/settings', { method: 'PUT', auth: false, headers: { 'x-admin-pin': p || '' }, body: { otp_provider: next } });
      setProvider(next);
    } catch (e: any) {
      Alert.alert('Could not switch provider', e.message);
    } finally { setTogglingProvider(false); }
  };

  const changeAdminPin = async () => {
    if (!/^\d{6,10}$/.test(newPin)) { Alert.alert('Invalid PIN', '6-10 digits'); return; }
    const p = await getAdminPin();
    try {
      await api('/admin/settings', { method: 'PUT', auth: false, headers: { 'x-admin-pin': p || '' }, body: { admin_pin: newPin } });
      await setAdminPin(newPin);
      setNewPin('');
      Alert.alert('Updated', 'Admin PIN updated.');
    } catch (e: any) {
      Alert.alert('Could not update PIN', e.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="admin-back" onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={theme.color.onSurface} /></Pressable>
          <Text style={styles.title}>Admin</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={{ padding: 20 }}>
          {!authed ? (
            <>
              <Text style={styles.heading}>Enter admin PIN</Text>
              <Text style={styles.helper}>Default PIN is <Text style={{ fontWeight: '700' }}>0000</Text>. Change it after first login.</Text>
              <FormField testID="admin-pin-input" label="Admin PIN" placeholder="0000" keyboardType="number-pad" secureTextEntry value={pin} onChangeText={setPin} error={err || undefined} />
              <PrimaryButton testID="admin-login-btn" title="Unlock" onPress={login} loading={loading} />
            </>
          ) : (
            <>
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>SMS OTP (Twilio)</Text>
                  <Text style={styles.cardSub}>
                    {provider === 'dev' ? 'DEV MODE — uses a fixed code for all signups' : 'Live — sends a real SMS code via Twilio'}
                  </Text>
                  {!twilioConfigured ? <Text style={styles.cardWarn}>Twilio isn&apos;t configured on the server yet.</Text> : null}
                </View>
                <Switch testID="admin-twilio-toggle" value={provider === 'twilio'} onValueChange={toggleProvider} disabled={togglingProvider} />
              </View>
              <View style={{ height: 16 }} />
              <Text style={styles.heading}>Change admin PIN</Text>
              <FormField testID="admin-new-pin-input" label="New PIN (6-10 digits)" keyboardType="number-pad" secureTextEntry value={newPin} onChangeText={setNewPin} />
              <PrimaryButton testID="admin-change-pin-btn" title="Update admin PIN" onPress={changeAdminPin} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  helper: { color: theme.color.onSurfaceMuted, fontSize: 13, marginBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surfaceSecondary, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.color.border },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { color: theme.color.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  cardWarn: { color: theme.color.error, fontSize: 11, marginTop: 4 },
});
