import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { theme, STATUS_COLORS } from '@/src/theme';
import { api } from '@/src/api/client';

export default function Catalog() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeGroup) params.set('group_id', activeGroup);
      if (q) params.set('q', q);
      const [g, p] = await Promise.all([api('/groups'), api(`/products${params.toString() ? '?' + params : ''}`)]);
      setGroups(g as any[]);
      setItems(p as any[]);
    } finally { setLoading(false); }
  }, [activeGroup, q]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Catalog</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={theme.color.onSurfaceMuted} />
          <TextInput
            testID="catalog-search"
            placeholder="Search products"
            placeholderTextColor="#A0A09D"
            style={{ flex: 1, fontSize: 15, color: theme.color.onSurface }}
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
            onSubmitEditing={load}
          />
        </View>
      </View>

      <View style={styles.chipsWrap}>
        <FlatList
          horizontal
          data={[{ id: null, name: 'All' }, ...groups]}
          keyExtractor={(g, i) => g.id || `all-${i}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          renderItem={({ item }) => {
            const active = activeGroup === item.id;
            return (
              <Pressable testID={`group-chip-${item.name}`} onPress={() => setActiveGroup(item.id)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && { color: theme.color.onBrand }]}>{item.name}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={theme.color.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={48} color={theme.color.onSurfaceMuted} />
          <Text style={styles.emptyTitle}>Your catalog is empty</Text>
          <Text style={styles.emptySub}>Tap the + button below to add your first product.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          renderItem={({ item }) => {
            const col = STATUS_COLORS[item.status] || { bg: '#EEE', fg: '#444' };
            return (
              <Pressable testID={`product-row-${item.id}`} onPress={() => router.push(`/product/${item.id}`)} style={styles.row}>
                {item.image_urls?.[0] ? (
                  <Image source={{ uri: item.image_urls[0] }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: theme.color.surfaceTertiary, alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="image-outline" size={22} color={theme.color.onSurfaceMuted} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{item.title}</Text>
                  <Text style={{ color: theme.color.onSurfaceMuted, fontSize: 12, marginTop: 2 }}>₹{item.price.toFixed(0)} · MOQ {item.min_quantity}</Text>
                  <View style={[styles.badge, { backgroundColor: col.bg, marginTop: 6 }]}>
                    <Text style={{ color: col.fg, fontSize: 11, fontWeight: '700' }}>{item.status}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.color.onSurfaceMuted} />
              </Pressable>
            );
          }}
        />
      )}

      <Pressable testID="catalog-fab" onPress={() => router.push('/product/new')} style={styles.fab}>
        <Ionicons name="add" size={28} color={theme.color.onBrand} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 28, fontWeight: '700' },
  search: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.color.surfaceSecondary, paddingHorizontal: 12, height: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.color.border },
  chipsWrap: { height: 56, justifyContent: 'center' },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: theme.color.surfaceTertiary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipActive: { backgroundColor: theme.color.brand },
  chipText: { color: theme.color.onSurface, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surfaceSecondary, borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: theme.color.border },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptySub: { color: theme.color.onSurfaceMuted, marginTop: 4, textAlign: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 100, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.color.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
