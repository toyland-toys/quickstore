import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '@/src/theme';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { api } from '@/src/api/client';

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','del'];

export default function PinSetup() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [phase, setPhase] = useState<'set' | 'confirm'>('set');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const current = phase === 'set' ? pin : confirmPin;

  const press = (k: string) => {
    Haptics.selectionAsync().catch(() => {});
    setErr(null);
    if (k === 'del') {
      phase === 'set' ? setPin(p => p.slice(0, -1)) : setConfirmPin(p => p.slice(0, -1));
      return;
    }
    if (current.length >= 4 || !k) return;
    const next = current + k;
    if (phase === 'set') {
      setPin(next);
      if (next.length === 4) setTimeout(() => setPhase('confirm'), 150);
    } else {
      setConfirmPin(next);
      if (next.length === 4) {
        if (next !== pin) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          setErr('PINs do not match. Try again.');
          setPin('');
          setConfirmPin('');
          setTimeout(() => setPhase('set'), 100);
        }
      }
    }
  };

  const save = async () => {
    try {
      setLoading(true);
      await api('/auth/set-pin', { method: 'POST', body: { pin } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace('/onboarding/handle');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Text style={styles.title}>{phase === 'set' ? 'Set a 4-digit PIN' : 'Confirm your PIN'}</Text>
        <Text style={styles.subtitle}>You&apos;ll use this PIN to quickly open the app.</Text>
        <View style={styles.dots}>
          {[0,1,2,3].map(i => (
            <View key={i} testID={`pin-dot-${i}`} style={[styles.dot, current.length > i && styles.dotFill]} />
          ))}
        </View>
        {err ? <Text style={styles.err}>{err}</Text> : <View style={{ height: 18 }} />}
        <View style={styles.pad}>
          {KEYS.map((k, idx) => (
            <Pressable
              key={idx}
              testID={`pin-key-${k || 'spacer'}`}
              onPress={() => press(k)}
              style={({ pressed }) => [styles.key, pressed && k && { backgroundColor: theme.color.surfaceTertiary }]}
              disabled={!k}
            >
              {k === 'del' ? <Ionicons name="backspace-outline" size={26} color={theme.color.onSurface} /> : <Text style={styles.keyText}>{k}</Text>}
            </Pressable>
          ))}
        </View>
        {phase === 'confirm' && confirmPin.length === 4 && pin === confirmPin ? (
          <PrimaryButton testID="save-pin-btn" title="Save PIN & continue" onPress={save} loading={loading} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 24, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: theme.color.onSurface },
  subtitle: { fontSize: 14, color: theme.color.onSurfaceMuted, marginTop: 6, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 16, marginTop: 40 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: theme.color.borderStrong },
  dotFill: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  err: { color: theme.color.error, marginTop: 16, fontSize: 13 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, marginTop: 24, marginBottom: 24 },
  key: { width: '33.333%', height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.md },
  keyText: { fontSize: 30, color: theme.color.onSurface, fontWeight: '500' },
});
