import '../services/location'; // definerer baggrundsopgaven i globalt scope (K36)
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppSettings } from '../core/settings';
import { translate } from '../i18n/strings';
import { runner } from '../services/runner';
import * as db from '../storage/db';
import { AppProvider } from '../ui/AppContext';
import { colors, fonts } from '../ui/theme';

// K42: den statiske startgrafik vises kun, mens appen faktisk starter.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 200 });

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular: require('../../assets/fonts/Archivo_400Regular.ttf'),
    Archivo_600SemiBold: require('../../assets/fonts/Archivo_600SemiBold.ttf'),
    Archivo_700Bold: require('../../assets/fonts/Archivo_700Bold.ttf'),
    Archivo_900Black_Italic: require('../../assets/fonts/Archivo_900Black_Italic.ttf'),
  });
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await db.initDb();
        setSettings(await db.loadSettings());
      } catch {
        const { DEFAULT_SETTINGS } = await import('../core/settings');
        setSettings(DEFAULT_SETTINGS);
      }
    })();
  }, []);

  const ready = (fontsLoaded || !!fontError) && !!settings;

  useEffect(() => {
    if (!ready || !settings) return;
    SplashScreen.hideAsync().catch(() => undefined);
    // K37: tilbyd gendannelse af en tur, der blev afbrudt af et nedbrud.
    (async () => {
      if (runner.active) return;
      const unfinished = await db.getUnfinishedSession().catch(() => null);
      if (!unfinished) return;
      const t = (k: Parameters<typeof translate>[1]) => translate(settings.lang, k);
      Alert.alert(t('recoverTitle'), t('recoverBody'), [
        {
          text: t('recoverSave'),
          onPress: async () => {
            const id = await runner.recover(unfinished.engine, unfinished.checkpointAt, 'save', settings);
            runner.clearFinished();
            router.push({ pathname: '/result/[id]', params: { id } });
          },
        },
        {
          text: t('recoverResume'),
          style: 'default',
          onPress: async () => {
            await runner.recover(unfinished.engine, unfinished.checkpointAt, 'resume', settings);
            router.push('/run');
          },
        },
      ]);
    })();
  }, [ready, settings]);

  if (!ready || !settings) return null;

  const t = (k: Parameters<typeof translate>[1]) => translate(settings.lang, k);
  return (
    <SafeAreaProvider>
      <AppProvider initial={settings}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.blue },
            headerTintColor: colors.white,
            headerTitleStyle: { fontFamily: fonts.bold },
            contentStyle: { backgroundColor: colors.white },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Run Pace', headerShown: false }} />
          <Stack.Screen name="quick" options={{ title: t('quickStart') }} />
          <Stack.Screen name="preset" options={{ title: t('adjustWorkout') }} />
          <Stack.Screen name="library" options={{ title: t('workouts') }} />
          <Stack.Screen name="builder" options={{ title: t('buildWorkout') }} />
          <Stack.Screen name="ready" options={{ title: t('readyToStart') }} />
          <Stack.Screen name="run" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="result/[id]" options={{ title: t('result') }} />
          <Stack.Screen name="history" options={{ title: t('history') }} />
          <Stack.Screen name="settings" options={{ title: t('settings') }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
