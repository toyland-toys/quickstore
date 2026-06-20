import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Linking, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { api } from '@/src/api/client';

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(name: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase()).join('') || '?';
}

export default function Visitors() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/visitors');
      setItems(r as any[]);
    } catch {} finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const call = (mobile: string) => {
    if (!mobile) return;
    Linking.openURL(`tel:${mobile.replace(/\s/g, '')}`).catch(() => {});
  };
  const whats = (mobile: string) => {
    if (!mobile) return;
    Linking.openURL(`https://wa.me/${mobile.replace(/[^0-9]/g, '')}`).catch(() => {});
  };

  const withMobile = items.filter(i => i.mobile);
  const withoutMobile = items.length - withMobile.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable testID="visitors-back" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={theme.color.onSurface} />
        </Pressable>
        <Text style={styles.title}>Visitors</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { marginRight: 8 }]}>
          <Text style={styles.statLabel}>Total visitors</Text>
          <Text style={styles.statValue} testID="visitors-total">{items.length}</Text>
        </View>
        <View style={[styles.statCard, { marginLeft: 8 }]}>
          <Text style={styles.statLabel}>With contact info</Text>
          <Text style={styles.statValue}>{withMobile.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={theme.color.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={theme.color.onSurfaceMuted} />
          <Text style={styles.emptyTitle}>No visitors yet</Text>
          <Text style={styles.emptySub}>
            Enable the buyer popup in Store → Buyer details popup. Names and mobiles will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i, idx) => i.id || String(idx)}
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`visitor-${item.id}`}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(item.name)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name || 'Anonymous'}</Text>
                <Text style={styles.mobile}>{item.mobile || 'No mobile shared'}</Text>
                <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
              </View>
              {item.mobile ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable testID={`call-${item.id}`} onPress={() => call(item.mobile)} style={styles.actionBtn}>
                    <Ionicons name="call" size={18} color={theme.color.brand} />
                  </Pressable>
                  <Pressable testID={`wa-${item.id}`} onPress={() => whats(item.mobile)} style={[styles.actionBtn, { backgroundColor: '#E0F4E6' }]}>
                    <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10 },
  statCard: { flex: 1, backgroundColor: theme.color.surfaceSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.color.border },
  statLabel: { color: theme.color.onSurfaceMuted, fontSize: 12 },
  statValue: { fontSize: 26, fontWeight: '700', marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptySub: { color: theme.color.onSurfaceMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.color.surfaceSecondary, padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.color.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.color.brand, fontWeight: '700', fontSize: 15 },
  name: { fontSize: 15, fontWeight: '700' },
  mobile: { fontSize: 13, color: theme.color.onSurface, marginTop: 1 },
  time: { fontSize: 11, color: theme.color.onSurfaceMuted, marginTop: 2 },
  actionBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.color.brandTertiary, alignItems: 'center', justifyContent: 'center' },
});
