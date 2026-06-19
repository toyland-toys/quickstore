import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { theme } from '@/src/theme';
import { api } from '@/src/api/client';

const TABS = ['Pending', 'Accepted', 'Shipped'] as const;
type Tab = typeof TABS[number];

export default function Orders() {
  const [tab, setTab] = useState<Tab>('Pending');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api(`/orders?status=${encodeURIComponent(tab)}`);
      setItems(r as any[]);
    } finally { setLoading(false); }
  }, [tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const advance = async (id: string, next: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await api(`/orders/${id}/status`, { method: 'PUT', body: { status: next } });
    load();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <View style={styles.tabs}>
          {TABS.map(t => (
            <Pressable key={t} testID={`orders-tab-${t}`} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t && { color: theme.color.onSurface }]}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={theme.color.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}><Text style={{ color: theme.color.onSurfaceMuted }}>No {tab.toLowerCase()} orders yet.</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`order-card-${item.id}`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', fontSize: 15 }}>{item.buyer_name}</Text>
                <Text style={{ color: theme.color.brand, fontWeight: '700' }}>₹{item.total.toFixed(0)}</Text>
              </View>
              <Text style={{ color: theme.color.onSurfaceMuted, fontSize: 12, marginTop: 2 }}>{item.buyer_mobile}</Text>
              <Text style={{ fontSize: 12, color: theme.color.onSurfaceMuted, marginTop: 2 }}>{item.items.length} items · {item.buyer_address}</Text>
              <View style={{ height: 1, backgroundColor: theme.color.divider, marginVertical: 10 }} />
              {item.items.slice(0, 3).map((it: any, i: number) => (
                <Text key={i} style={{ fontSize: 12, color: theme.color.onSurface }}>{it.quantity}× {it.title}</Text>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {tab === 'Pending' && (
                  <>
                    <Pressable testID={`accept-${item.id}`} style={[styles.cta, { backgroundColor: theme.color.brand }]} onPress={() => advance(item.id, 'Accepted')}>
                      <Text style={{ color: theme.color.onBrand, fontWeight: '700' }}>Accept</Text>
                    </Pressable>
                    <Pressable style={[styles.cta, { backgroundColor: theme.color.surfaceTertiary }]} onPress={() => advance(item.id, 'Cancelled')}>
                      <Text style={{ color: theme.color.onSurface, fontWeight: '600' }}>Decline</Text>
                    </Pressable>
                  </>
                )}
                {tab === 'Accepted' && (
                  <Pressable testID={`ship-${item.id}`} style={[styles.cta, { backgroundColor: theme.color.brand }]} onPress={() => advance(item.id, 'Shipped')}>
                    <Text style={{ color: theme.color.onBrand, fontWeight: '700' }}>Mark shipped</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 28, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: theme.color.surfaceTertiary, borderRadius: 999, padding: 4, marginTop: 12 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 999 },
  tabActive: { backgroundColor: theme.color.surfaceSecondary },
  tabText: { color: theme.color.onSurfaceMuted, fontWeight: '600', fontSize: 13 },
  card: { backgroundColor: theme.color.surfaceSecondary, padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: theme.color.border },
  cta: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, flex: 1, alignItems: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
