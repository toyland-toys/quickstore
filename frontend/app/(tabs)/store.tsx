import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { theme, BRAND_COLORS } from '@/src/theme';
import { FormField } from '@/src/components/FormField';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { api, clearToken } from '@/src/api/client';

export default function StoreSettings() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [color, setColor] = useState(BRAND_COLORS[0]);
  const [whats, setWhats] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const m: any = await api('/me');
    setMe(m);
    setTitle(m.shop?.title || '');
    setTagline(m.shop?.tagline || '');
    setColor(m.shop?.bg_color || BRAND_COLORS[0]);
    setWhats(m.shop?.whatsapp_number || m.mobile_number || '');
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    try {
      setSaving(true);
      await api('/me/shop', { method: 'PUT', body: { title, tagline, bg_color: color, whatsapp_number: whats } });
      await load();
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally { setSaving(false); }
  };

  const url = `yourdomain.com/${me?.handle || ''}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Text style={styles.title}>Store settings</Text>

        <Pressable testID="store-copy-link" onPress={() => { Clipboard.setStringAsync('https://' + url); }} style={[styles.linkBox, { backgroundColor: color + '20' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: theme.color.onSurfaceMuted }}>Your public storefront</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.color.onSurface }}>{url}</Text>
          </View>
          <Ionicons name="copy-outline" size={20} color={theme.color.onSurface} />
        </Pressable>

        <Pressable testID="store-preview-btn" onPress={() => router.push('/storefront-preview')} style={styles.previewBtn}>
          <Ionicons name="eye-outline" size={18} color={theme.color.brand} />
          <Text style={{ color: theme.color.brand, fontWeight: '700' }}>Preview buyer view</Text>
        </Pressable>

        <Text style={styles.section}>Shop appearance</Text>
        <FormField testID="store-title-input" label="Store title" placeholder="Zee Toys - Best Wooden Toys in Town" value={title} onChangeText={setTitle} />
        <FormField testID="store-tagline-input" label="Tagline" placeholder="Wholesale toy distributor" value={tagline} onChangeText={setTagline} />

        <Text style={styles.label}>Brand color</Text>
        <View style={styles.colors}>
          {BRAND_COLORS.map(c => (
            <Pressable key={c} testID={`color-${c}`} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorActive]} />
          ))}
        </View>

        <FormField testID="store-whatsapp-input" label="WhatsApp number (for buyer order handoff)" placeholder="+91…" keyboardType="phone-pad" value={whats} onChangeText={setWhats} />

        <PrimaryButton testID="store-save-btn" title="Save changes" onPress={save} loading={saving} />

        <View style={{ height: 28 }} />
        <Pressable testID="store-logout-btn" onPress={async () => { await clearToken(); router.replace('/onboarding/phone'); }} style={styles.logoutRow}>
          <Ionicons name="log-out-outline" size={20} color={theme.color.error} />
          <Text style={{ color: theme.color.error, fontWeight: '600' }}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 16 },
  linkBox: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 10 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: theme.color.brandTertiary, alignSelf: 'flex-start', marginBottom: 20 },
  section: { fontSize: 14, fontWeight: '700', marginTop: 8, marginBottom: 12 },
  label: { fontSize: 12, color: theme.color.onSurfaceMuted, fontWeight: '600', marginBottom: 8 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  colorDot: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  colorActive: { borderColor: theme.color.onSurface },
  logoutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
});
