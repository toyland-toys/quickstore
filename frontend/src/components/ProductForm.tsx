import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { theme, STATUS_OPTIONS, STATUS_COLORS } from '@/src/theme';
import { FormField } from '@/src/components/FormField';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { api, uploadToB2 } from '@/src/api/client';

type Props = { mode: 'new' | 'edit' };

export function ProductForm({ mode }: Props) {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [moq, setMoq] = useState('1');
  const [status, setStatus] = useState('Available');
  const [images, setImages] = useState<string[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    (async () => {
      const g: any = await api('/groups');
      setGroups(g);
      if (mode === 'edit' && id) {
        try {
          const p: any = await api(`/products/${id}`);
          setTitle(p.title); setDesc(p.description || ''); setPrice(String(p.price));
          setMoq(String(p.min_quantity)); setStatus(p.status);
          setImages(p.image_urls || []); setGroupId(p.group_id || null);
        } finally { setLoading(false); }
      }
    })();
  }, [id, mode]);

  const pickImage = async () => {
    if (images.length >= 5) { Alert.alert('Limit', 'Up to 5 images allowed'); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required', 'Allow photo access to add images'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    try {
      setUploading(true);
      // Convert any format (HEIC/PNG/WebP) to JPEG for universal display compatibility.
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
      );
      const name = `image-${Date.now()}.jpg`;
      const ct = 'image/jpeg';
      const presign: any = await api('/uploads/presign', { method: 'POST', body: { filename: name, content_type: ct } });
      await uploadToB2(presign.upload_url, manipulated.uri, ct);
      setImages(curr => [...curr, presign.public_url]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally { setUploading(false); }
  };

  const save = async () => {
    const p = parseFloat(price);
    const m = parseInt(moq, 10);
    if (!title.trim() || isNaN(p) || p < 0 || isNaN(m) || m < 1) {
      Alert.alert('Missing info', 'Please fill title, valid price and MOQ');
      return;
    }
    const body = { title: title.trim(), description: desc, price: p, min_quantity: m, status, group_id: groupId, image_urls: images };
    try {
      setSaving(true);
      if (mode === 'edit' && id) await api(`/products/${id}`, { method: 'PUT', body });
      else await api('/products', { method: 'POST', body });
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!id) return;
    Alert.alert('Delete product?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api(`/products/${id}`, { method: 'DELETE' }); router.back(); } },
    ]);
  };

  if (loading) return <SafeAreaView style={styles.safe}><ActivityIndicator color={theme.color.brand} style={{ marginTop: 40 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="form-back" onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={theme.color.onSurface} /></Pressable>
          <Text style={styles.headerTitle}>{mode === 'new' ? 'New product' : 'Edit product'}</Text>
          {mode === 'edit' ? <Pressable testID="form-delete" onPress={remove}><Ionicons name="trash-outline" size={22} color={theme.color.error} /></Pressable> : <View style={{ width: 22 }} />}
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text style={styles.label}>Images (up to 5)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            <Pressable testID="add-image-btn" onPress={pickImage} style={[styles.imgTile, { backgroundColor: theme.color.brandTertiary, alignItems: 'center', justifyContent: 'center' }]}>
              {uploading ? <ActivityIndicator color={theme.color.brand} /> : <><Ionicons name="add" size={26} color={theme.color.brand} /><Text style={{ color: theme.color.brand, fontSize: 11, fontWeight: '600' }}>Add</Text></>}
            </Pressable>
            {images.map((uri, i) => (
              <View key={i} style={styles.imgTile}>
                <Image source={{ uri }} style={{ width: '100%', height: '100%', borderRadius: 12 }} contentFit="cover" />
                <Pressable testID={`remove-image-${i}`} onPress={() => setImages(s => s.filter((_, j) => j !== i))} style={styles.imgRemove}>
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>

          <View style={{ height: 18 }} />
          <FormField testID="form-title" label="Title" value={title} onChangeText={setTitle} placeholder="Wooden tractor" />
          <FormField testID="form-desc" label="Description" value={desc} onChangeText={setDesc} placeholder="Hand-crafted, eco-paint" multiline numberOfLines={3} style={{ height: 90, paddingTop: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><FormField testID="form-price" label="Price (₹)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="250" /></View>
            <View style={{ flex: 1 }}><FormField testID="form-moq" label="Min Quantity" value={moq} onChangeText={setMoq} keyboardType="numeric" placeholder="1" /></View>
          </View>

          <Text style={styles.label}>Stock status</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {STATUS_OPTIONS.map(s => {
              const active = status === s;
              const col = STATUS_COLORS[s];
              return (
                <Pressable key={s} testID={`status-${s}`} onPress={() => setStatus(s)} style={[styles.statusChip, { backgroundColor: active ? col.bg : theme.color.surfaceSecondary, borderColor: active ? col.fg : theme.color.border }]}>
                  <Text style={{ color: active ? col.fg : theme.color.onSurface, fontSize: 12, fontWeight: '600' }}>{s}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Group</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            <Pressable testID="group-pick-none" onPress={() => setGroupId(null)} style={[styles.statusChip, { backgroundColor: groupId === null ? theme.color.brand : theme.color.surfaceSecondary, borderColor: groupId === null ? theme.color.brand : theme.color.border }]}>
              <Text style={{ color: groupId === null ? theme.color.onBrand : theme.color.onSurface, fontSize: 12, fontWeight: '600' }}>None</Text>
            </Pressable>
            {groups.map(g => {
              const active = groupId === g.id;
              return (
                <Pressable key={g.id} testID={`group-pick-${g.name}`} onPress={() => setGroupId(g.id)} style={[styles.statusChip, { backgroundColor: active ? theme.color.brand : theme.color.surfaceSecondary, borderColor: active ? theme.color.brand : theme.color.border }]}>
                  <Text style={{ color: active ? theme.color.onBrand : theme.color.onSurface, fontSize: 12, fontWeight: '600' }}>{g.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <PrimaryButton testID="form-save-btn" title={mode === 'new' ? 'Add product' : 'Save changes'} onPress={save} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 12, color: theme.color.onSurfaceMuted, fontWeight: '600', marginBottom: 8 },
  imgTile: { width: 96, height: 96, borderRadius: 12, position: 'relative' },
  imgRemove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  statusChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
