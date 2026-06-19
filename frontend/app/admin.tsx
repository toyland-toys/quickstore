import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { FormField } from '@/src/components/FormField';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { getAdminPin, setAdminPin } from '@/src/api/client';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function Admin() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState('');
  const [provider, setProvider] = useState<'dev' | 'twilio'>('dev');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newPin, setNewPin] = useState('');

  const login = async () => {
    setErr(null);
    try {
      setLoading(true);
      const res = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
      if (!res.ok) throw new Error('Wrong admin PIN');
      await setAdminPin(pin);
      const r = await fetch(`${BASE}/api/admin/settings`, { headers: { 'x-admin-pin': pin } });
      const s = await r.json();
      setProvider(s.otp_provider);
      setAuthed(true);
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  const toggleProvider = async (value: boolean) => {
    const next = value ? 'twilio' : 'dev';
    const p = await getAdminPin();
    if (next === 'twilio') {
      Alert.alert('Twilio not configured', 'Twilio is a scaffold for now. Add Twilio credentials to backend .env before enabling. Keeping DEV mode for testing.');
      return;
    }
    setProvider(next);
    await fetch(`${BASE}/api/admin/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-pin': p || '' }, body: JSON.stringify({ otp_provider: next }) });
  };

  const changeAdminPin = async () => {
    if (!/^\d{4,8}$/.test(newPin)) { Alert.alert('Invalid PIN', '4-8 digits'); return; }
    const p = await getAdminPin();
    await fetch(`${BASE}/api/admin/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-pin': p || '' }, body: JSON.stringify({ admin_pin: newPin }) });
    await setAdminPin(newPin);
    setNewPin('');
    Alert.alert('Updated', 'Admin PIN updated.');
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
                  <Text style={styles.cardSub}>{provider === 'dev' ? 'DEV MODE — uses code 123456 for all signups' : 'Live — sends SMS via Twilio'}</Text>
                </View>
                <Switch testID="admin-twilio-toggle" value={provider === 'twilio'} onValueChange={toggleProvider} />
              </View>
              <View style={{ height: 16 }} />
              <Text style={styles.heading}>Change admin PIN</Text>
              <FormField testID="admin-new-pin-input" label="New PIN (4-8 digits)" keyboardType="number-pad" secureTextEntry value={newPin} onChangeText={setNewPin} />
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
});
