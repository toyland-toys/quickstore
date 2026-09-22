import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { api } from '@/src/api/client';
import { publicShopOriginDisplay } from '@/src/config';

export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, p, o] = await Promise.all([api('/me'), api('/products'), api('/orders')]);
      setMe(m); setProducts(p as any[]); setOrders(o as any[]);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pendingCount = orders.filter(o => o.status === 'Pending').length;
  const lowStock = products.filter(p => p.status === 'Limited stock' || p.status === 'Out of stock').length;
  const recent = orders.slice(0, 3);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.hello}>Hello,</Text>
            <Text style={styles.shopName} testID="home-shop-name">{me?.shop?.title || me?.handle || 'your shop'}</Text>
            <Text style={styles.handleLine}>{publicShopOriginDisplay()}/{me?.handle || '—'}</Text>
          </View>
          <Pressable testID="home-change-pin-btn" onPress={() => router.push('/change-pin')} style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={22} color={theme.color.onSurface} />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { marginRight: 8 }]}>
            <Text style={styles.statLabel}>Pending orders</Text>
            <Text style={styles.statValue} testID="home-pending-count">{pendingCount}</Text>
          </View>
          <View style={[styles.statCard, { marginLeft: 8 }]}>
            <Text style={styles.statLabel}>Low / out of stock</Text>
            <Text style={styles.statValue}>{lowStock}</Text>
          </View>
        </View>

        <Text style={styles.section}>Quick actions</Text>
        <View style={{ gap: 10 }}>
          <Pressable testID="home-add-product-btn" onPress={() => router.push('/product/new')} style={styles.action}>
            <Ionicons name="add-circle" size={22} color={theme.color.brand} />
            <Text style={styles.actionText}>Add product</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.color.onSurfaceMuted} />
          </Pressable>
          <Pressable testID="home-groups-btn" onPress={() => router.push('/groups')} style={styles.action}>
            <Ionicons name="folder-outline" size={22} color={theme.color.brand} />
            <Text style={styles.actionText}>Manage groups</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.color.onSurfaceMuted} />
          </Pressable>
          <Pressable testID="home-customize-btn" onPress={() => router.push('/(tabs)/store')} style={styles.action}>
            <Ionicons name="color-palette-outline" size={22} color={theme.color.brand} />
            <Text style={styles.actionText}>Customize store</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.color.onSurfaceMuted} />
          </Pressable>
          <Pressable testID="home-preview-btn" onPress={() => router.push('/storefront-preview')} style={styles.action}>
            <Ionicons name="eye-outline" size={22} color={theme.color.brand} />
            <Text style={styles.actionText}>Preview shop</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.color.onSurfaceMuted} />
          </Pressable>
          <Pressable testID="home-visitors-btn" onPress={() => router.push('/visitors')} style={styles.action}>
            <Ionicons name="people-outline" size={22} color={theme.color.brand} />
            <Text style={styles.actionText}>Visitors</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.color.onSurfaceMuted} />
          </Pressable>
        </View>

        <Text style={styles.section}>Recent orders</Text>
        {recent.length === 0 ? (
          <View style={styles.empty}><Text style={{ color: theme.color.onSurfaceMuted }}>No orders yet. Share your shop link to start receiving orders.</Text></View>
        ) : recent.map(o => (
          <View key={o.id} style={styles.orderRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700' }}>{o.buyer_name}</Text>
              <Text style={{ color: theme.color.onSurfaceMuted, fontSize: 12 }}>{o.items.length} items · ₹{o.total.toFixed(0)}</Text>
            </View>
            <Text style={{ color: theme.color.brand, fontWeight: '600' }}>{o.status}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  hello: { color: theme.color.onSurfaceMuted, fontSize: 13 },
  shopName: { fontSize: 22, fontWeight: '700', color: theme.color.onSurface, marginTop: 2 },
  handleLine: { color: theme.color.brand, fontSize: 12, marginTop: 2 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border },
  statsRow: { flexDirection: 'row', marginTop: 20 },
  statCard: { flex: 1, backgroundColor: theme.color.surfaceSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.color.border },
  statLabel: { color: theme.color.onSurfaceMuted, fontSize: 12 },
  statValue: { fontSize: 28, fontWeight: '700', marginTop: 6 },
  section: { fontSize: 14, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  action: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.brandTertiary, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, gap: 12 },
  actionText: { flex: 1, color: theme.color.onSurface, fontWeight: '600' },
  empty: { padding: 16, backgroundColor: theme.color.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: theme.color.border },
  orderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surfaceSecondary, padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.color.border },
});
