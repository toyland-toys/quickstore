import React, { useEffect } from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { loadToken } from '@/src/api/client';

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loaded || error) {
      (async () => {
        const t = await loadToken();
        SplashScreen.hideAsync();
        // /admin is the app-owner panel, gated by its own separate PIN (see
        // admin.tsx) -- not a seller session. Without this, loading it as a
        // fresh URL (rather than reaching it via the in-app gear icon) always
        // got redirected away before it could render, since this effect
        // otherwise always sends a fresh page load to onboarding/pin-lock
        // regardless of which URL was actually requested.
        if (pathname === '/admin') return;
        if (!t) router.replace('/onboarding/phone');
        else router.replace('/pin-lock');
      })();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F9F9F8' } }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
