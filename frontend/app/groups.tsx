import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { api } from '@/src/api/client';

export default function Groups() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    const r: any = await api('/groups');
    setItems(r);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!name.trim()) return;
    await api('/groups', { method: 'POST', body: { name: name.trim() } });
    setName('');
    load();
  };

  const remove = (g: any) => {
    Alert.alert('Delete group?', `"${g.name}" will be removed; products inside become ungrouped.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api(`/groups/${g.id}`, { method: 'DELETE' }); load(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable testID="groups-back" onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={theme.color.onSurface} /></Pressable>
        <Text style={styles.title}>Product groups</Text>
        <View style={{ width: 26 }} />
      </View>
      <View style={{ padding: 20 }}>
        <View style={styles.inputRow}>
          <TextInput testID="group-name-input" placeholder="e.g. Wooden Toys" placeholderTextColor="#A0A09D" value={name} onChangeText={setName} style={styles.input} />
          <Pressable testID="group-add-btn" onPress={add} style={styles.addBtn}><Ionicons name="add" size={22} color={theme.color.onBrand} /></Pressable>
        </View>
      </View>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        contentContainerStyle={{ paddingHorizontal: 20 }}
        ListEmptyComponent={<Text style={{ color: theme.color.onSurfaceMuted, padding: 8 }}>No groups yet. Create one to organize your catalog.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Ionicons name="folder-outline" size={20} color={theme.color.brand} />
            <Text style={{ flex: 1, fontWeight: '600', marginLeft: 10 }}>{item.name}</Text>
            <Pressable testID={`group-delete-${item.name}`} onPress={() => remove(item)}><Ionicons name="trash-outline" size={20} color={theme.color.error} /></Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, height: 48, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: 12, paddingHorizontal: 12 },
  addBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: theme.color.brand, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surfaceSecondary, padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.color.border },
});
