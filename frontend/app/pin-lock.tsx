import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '@/src/theme';
import { api, clearToken } from '@/src/api/client';

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','del'];

export default function PinLock() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const press = async (k: string) => {
    Haptics.selectionAsync().catch(() => {});
    setErr(null);
    if (k === 'del') return setPin(p => p.slice(0, -1));
    if (!k || pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      try {
        await api('/auth/verify-pin', { method: 'POST', body: { pin: next } });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // Check user state to decide where to go
        const me: any = await api('/me');
        if (!me.handle) router.replace('/onboarding/handle');
        else router.replace('/(tabs)');
      } catch (e: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setErr(e.message);
        setPin('');
      }
    }
  };

  const logout = async () => {
    await clearToken();
    router.replace('/onboarding/phone');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.logoCircle}><Ionicons name="lock-closed" size={28} color={theme.color.brand} /></View>
        <Text style={styles.title}>Enter your PIN</Text>
        <View style={styles.dots}>
          {[0,1,2,3].map(i => (
            <View key={i} testID={`lock-dot-${i}`} style={[styles.dot, pin.length > i && styles.dotFill]} />
          ))}
        </View>
        {err ? <Text style={styles.err}>{err}</Text> : <View style={{ height: 18 }} />}
        <View style={styles.pad}>
          {KEYS.map((k, idx) => (
            <Pressable
              key={idx}
              testID={`lock-key-${k || 'spacer'}`}
              onPress={() => press(k)}
              disabled={!k}
              style={({ pressed }) => [styles.key, pressed && k && { backgroundColor: theme.color.surfaceTertiary }]}
            >
              {k === 'del' ? <Ionicons name="backspace-outline" size={26} color={theme.color.onSurface} /> : <Text style={styles.keyText}>{k}</Text>}
            </Pressable>
          ))}
        </View>
        <Pressable testID="lock-logout-btn" onPress={logout} style={{ padding: 12 }}>
          <Text style={{ color: theme.color.onSurfaceMuted, fontSize: 13 }}>Sign in with a different number</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  body: { flex: 1, alignItems: 'center', paddingTop: 40 },
  logoCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.color.brandTertiary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 16, marginTop: 28 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: theme.color.borderStrong },
  dotFill: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  err: { color: theme.color.error, marginTop: 14, fontSize: 13 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, marginTop: 18, marginBottom: 8 },
  key: { width: '33.333%', height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.md },
  keyText: { fontSize: 30, fontWeight: '500' },
});
