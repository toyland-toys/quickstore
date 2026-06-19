import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, STATUS_COLORS } from '@/src/theme';
import { api } from '@/src/api/client';

const W = Dimensions.get('window').width;

export default function StorefrontPreview() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me: any = await api('/me');
      if (!me.handle) { setLoading(false); return; }
      const r: any = await api(`/storefront/${me.handle}`, { auth: false });
      setData(r);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <SafeAreaView style={styles.safe}><ActivityIndicator color={theme.color.brand} style={{ marginTop: 60 }} /></SafeAreaView>;
  if (!data) return <SafeAreaView style={styles.safe}><Text style={{ padding: 24, textAlign: 'center' }}>Claim a handle first to see your storefront.</Text></SafeAreaView>;

  const shop = data.seller.shop || {};
  const brand = shop.bg_color || theme.color.brand;
  const products = groupFilter ? data.products.filter((p: any) => p.group_id === groupFilter) : data.products;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable testID="preview-back" onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={theme.color.onSurface} /></Pressable>
        <View style={styles.urlBar}><Ionicons name="lock-closed" size={11} color={theme.color.onSurfaceMuted} /><Text style={styles.urlText}>yourdomain.com/{data.seller.handle}</Text></View>
        <Pressable testID="preview-refresh" onPress={load}><Ionicons name="refresh" size={22} color={theme.color.onSurface} /></Pressable>
      </View>
      <ScrollView style={styles.frame} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.banner, { backgroundColor: brand }]}>
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.45)']} style={StyleSheet.absoluteFill} />
          <View style={{ padding: 20, marginTop: 40 }}>
            <Text style={styles.shopTitle}>{shop.title || data.seller.handle}</Text>
            {shop.tagline ? <Text style={styles.shopTag}>{shop.tagline}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={styles.heroChip}><Ionicons name="checkmark-circle" size={12} color="#fff" /><Text style={styles.heroChipText}>{data.products.length} products</Text></View>
              {shop.whatsapp_number ? <View style={styles.heroChip}><Ionicons name="logo-whatsapp" size={12} color="#fff" /><Text style={styles.heroChipText}>WhatsApp</Text></View> : null}
            </View>
          </View>
        </View>

        {data.groups.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 16 }}>
            <Pressable onPress={() => setGroupFilter(null)} style={[styles.chip, !groupFilter && { backgroundColor: brand }]}>
              <Text style={[styles.chipText, !groupFilter && { color: '#fff' }]}>All</Text>
            </Pressable>
            {data.groups.map((g: any) => (
              <Pressable key={g.id} onPress={() => setGroupFilter(g.id)} style={[styles.chip, groupFilter === g.id && { backgroundColor: brand }]}>
                <Text style={[styles.chipText, groupFilter === g.id && { color: '#fff' }]}>{g.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.grid}>
          {products.map((p: any) => {
            const col = STATUS_COLORS[p.status] || { bg: '#EEE', fg: '#444' };
            return (
              <View key={p.id} style={styles.card}>
                {p.image_urls?.[0] ? (
                  <Image source={{ uri: p.image_urls[0] }} style={styles.cardImg} contentFit="cover" />
                ) : <View style={[styles.cardImg, { backgroundColor: theme.color.surfaceTertiary }]} />}
                <View style={{ padding: 10 }}>
                  <Text numberOfLines={1} style={{ fontWeight: '700' }}>{p.title}</Text>
                  <Text style={{ color: brand, fontWeight: '700', marginTop: 2 }}>₹{p.price.toFixed(0)}</Text>
                  <Text style={{ color: theme.color.onSurfaceMuted, fontSize: 11 }}>MOQ {p.min_quantity}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: col.bg }]}>
                    <Text style={{ color: col.fg, fontSize: 10, fontWeight: '700' }}>{p.status}</Text>
                  </View>
                </View>
              </View>
            );
          })}
          {products.length === 0 ? (
            <Text style={{ padding: 24, textAlign: 'center', width: '100%', color: theme.color.onSurfaceMuted }}>No products in this category yet.</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: theme.color.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  urlBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.color.surfaceTertiary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  urlText: { fontSize: 12, color: theme.color.onSurfaceMuted },
  frame: { flex: 1, backgroundColor: '#fff' },
  banner: { height: 200 },
  shopTitle: { color: '#fff', fontSize: 24, fontWeight: '700' },
  shopTag: { color: '#fff', opacity: 0.9, marginTop: 4, fontSize: 13 },
  heroChip: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  heroChipText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  chip: { paddingHorizontal: 14, height: 32, borderRadius: 999, backgroundColor: theme.color.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.color.onSurface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  card: { width: (W - 16 * 3) / 2, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: theme.color.border, overflow: 'hidden' },
  cardImg: { width: '100%', height: 120 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 6 },
});
