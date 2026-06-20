import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { theme, BRAND_COLORS } from '@/src/theme';
import { FormField } from '@/src/components/FormField';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { api, clearToken } from '@/src/api/client';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function StoreSettings() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  // Branding
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [color, setColor] = useState(BRAND_COLORS[0]);
  // Contact (Feature 2)
  const [whats, setWhats] = useState('');
  const [mobile1, setMobile1] = useState('');
  const [mobile2, setMobile2] = useState('');
  const [landline, setLandline] = useState('');
  const [address, setAddress] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  // Gate (Feature 4)
  const [gateEnabled, setGateEnabled] = useState(false);
  const [gateRequired, setGateRequired] = useState(false);
  const [gateTitle, setGateTitle] = useState('');
  const [gateSubtitle, setGateSubtitle] = useState('');

  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const m: any = await api('/me');
    setMe(m);
    const s = m.shop || {};
    setTitle(s.title || '');
    setTagline(s.tagline || '');
    setColor(s.bg_color || BRAND_COLORS[0]);
    setWhats(s.whatsapp_number || m.mobile_number || '');
    setMobile1(s.mobile_primary || m.mobile_number || '');
    setMobile2(s.mobile_secondary || '');
    setLandline(s.landline || '');
    setAddress(s.address || '');
    setMapsUrl(s.maps_url || '');
    setGateEnabled(!!s.gate_enabled);
    setGateRequired(!!s.gate_required);
    setGateTitle(s.gate_title || '');
    setGateSubtitle(s.gate_subtitle || '');
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    try {
      setSaving(true);
      await api('/me/shop', { method: 'PUT', body: {
        title, tagline, bg_color: color,
        whatsapp_number: whats,
        mobile_primary: mobile1,
        mobile_secondary: mobile2,
        landline,
        address,
        maps_url: mapsUrl,
        gate_enabled: gateEnabled,
        gate_required: gateEnabled && gateRequired,
        gate_title: gateTitle,
        gate_subtitle: gateSubtitle,
      }});
      await load();
      Alert.alert('Saved', 'Storefront updated successfully.');
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally { setSaving(false); }
  };

  const handle = me?.handle || '';
  const url = `${BASE}/api/shop/${handle}`;
  const displayUrl = `yourdomain.com/shop/${handle}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Store settings</Text>

          <Pressable testID="store-copy-link" onPress={() => { Clipboard.setStringAsync(url); Alert.alert('Copied', 'Storefront link copied to clipboard.'); }} style={[styles.linkBox, { backgroundColor: color + '20' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: theme.color.onSurfaceMuted }}>Your public storefront</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.color.onSurface }} numberOfLines={1}>{displayUrl}</Text>
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

          <Text style={styles.section}>Contact & address</Text>
          <Text style={styles.helper}>Shown in the footer of your public storefront.</Text>
          <FormField testID="store-address-input" label="Shop address" placeholder="123 Market Rd, Floor 2, Indore, MP 452001" value={address} onChangeText={setAddress} multiline numberOfLines={3} style={{ height: 92, paddingTop: 12 }} />
          <FormField testID="store-mobile1-input" label="Primary mobile" placeholder="+91…" keyboardType="phone-pad" value={mobile1} onChangeText={setMobile1} />
          <FormField testID="store-mobile2-input" label="Secondary mobile (optional)" placeholder="+91…" keyboardType="phone-pad" value={mobile2} onChangeText={setMobile2} />
          <FormField testID="store-landline-input" label="Landline (optional)" placeholder="0731 123 4567" keyboardType="phone-pad" value={landline} onChangeText={setLandline} />
          <FormField testID="store-whatsapp-input" label="WhatsApp number" placeholder="+91…" keyboardType="phone-pad" value={whats} onChangeText={setWhats} />
          <FormField testID="store-maps-input" label="Google Maps link (optional)" placeholder="https://maps.app.goo.gl/…" autoCapitalize="none" autoCorrect={false} value={mapsUrl} onChangeText={setMapsUrl} />

          <Text style={styles.section}>Buyer details popup</Text>
          <Text style={styles.helper}>Ask visitors for their name & mobile before they browse.</Text>
          <View style={styles.toggleCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Show popup on landing</Text>
              <Text style={styles.toggleSub}>A modal asks visitors for name + mobile.</Text>
            </View>
            <Switch testID="gate-toggle" value={gateEnabled} onValueChange={setGateEnabled} />
          </View>
          {gateEnabled ? (
            <>
              <View style={styles.toggleCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Make it mandatory</Text>
                  <Text style={styles.toggleSub}>Visitors must fill the form to view your catalog.</Text>
                </View>
                <Switch testID="gate-required-toggle" value={gateRequired} onValueChange={setGateRequired} />
              </View>
              <FormField testID="gate-title-input" label="Popup title (optional)" placeholder="Welcome!" value={gateTitle} onChangeText={setGateTitle} />
              <FormField testID="gate-subtitle-input" label="Popup message (optional)" placeholder="Please share your name and mobile to view this catalog." value={gateSubtitle} onChangeText={setGateSubtitle} multiline numberOfLines={2} style={{ height: 72, paddingTop: 12 }} />
            </>
          ) : null}

          <View style={{ height: 12 }} />
          <PrimaryButton testID="store-save-btn" title="Save changes" onPress={save} loading={saving} />

          <View style={{ height: 28 }} />
          <Pressable testID="store-logout-btn" onPress={async () => { await clearToken(); router.replace('/onboarding/phone'); }} style={styles.logoutRow}>
            <Ionicons name="log-out-outline" size={20} color={theme.color.error} />
            <Text style={{ color: theme.color.error, fontWeight: '600' }}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 16 },
  linkBox: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 10 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: theme.color.brandTertiary, alignSelf: 'flex-start', marginBottom: 20 },
  section: { fontSize: 14, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  helper: { fontSize: 12, color: theme.color.onSurfaceMuted, marginBottom: 12 },
  label: { fontSize: 12, color: theme.color.onSurfaceMuted, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  colorDot: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  colorActive: { borderColor: theme.color.onSurface },
  toggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.color.surfaceSecondary, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.color.border, marginBottom: 10 },
  toggleTitle: { fontSize: 14, fontWeight: '700' },
  toggleSub: { color: theme.color.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  logoutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
});
