import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { FormField } from '@/src/components/FormField';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { api } from '@/src/api/client';
import { publicShopOriginDisplay } from '@/src/config';

export default function HandleScreen() {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [checking, setChecking] = useState(false);
  const [avail, setAvail] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setAvail(null);
    setReason(null);
    const v = handle.trim().toLowerCase();
    if (!v) return;
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const r: any = await api(`/handles/check?handle=${encodeURIComponent(v)}`);
        setAvail(r.available);
        setReason(r.reason || null);
      } catch {} finally { setChecking(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [handle]);

  const claim = async () => {
    if (!avail) return;
    try {
      setSaving(true);
      await api('/handles/claim', { method: 'POST', body: { handle: handle.trim().toLowerCase() } });
      router.replace('/(tabs)');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.body}>
          <Text style={styles.title}>Claim your shop handle</Text>
          <Text style={styles.subtitle}>This becomes your public storefront URL.</Text>
          <View style={styles.urlBox}>
            <Text style={styles.urlPrefix}>{publicShopOriginDisplay()}/</Text>
            <Text style={styles.urlHandle}>{handle || 'yourshop'}</Text>
          </View>
          <FormField
            testID="handle-input"
            label="Handle"
            placeholder="zeetoys"
            value={handle}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setHandle}
            error={err || undefined}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {checking ? <ActivityIndicator size="small" color={theme.color.brand} /> : null}
            {!checking && avail === true ? <><Ionicons name="checkmark-circle" size={18} color={theme.color.success} /><Text style={{ color: theme.color.success, fontWeight: '600' }}>Available</Text></> : null}
            {!checking && avail === false ? <><Ionicons name="close-circle" size={18} color={theme.color.error} /><Text style={{ color: theme.color.error }}>{reason || 'Taken'}</Text></> : null}
          </View>
        </View>
        <View style={styles.footer}>
          <PrimaryButton testID="claim-handle-btn" title="Claim handle" onPress={claim} loading={saving} disabled={!avail} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 32 },
  title: { fontSize: 26, fontWeight: '700', color: theme.color.onSurface },
  subtitle: { fontSize: 14, color: theme.color.onSurfaceMuted, marginTop: 6, marginBottom: 20 },
  urlBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.brandTertiary, borderRadius: 12, padding: 14, marginBottom: 20 },
  urlPrefix: { color: theme.color.onSurfaceMuted, fontSize: 14 },
  urlHandle: { color: theme.color.brand, fontSize: 15, fontWeight: '700' },
  footer: { padding: 20 },
});
