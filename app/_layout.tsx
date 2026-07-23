import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { getDb } from '@/db/database';
import { getJsonSetting } from '@/db/settings';
import {
  registerUpdateTask,
  SETTING_ENABLED,
  SETTING_INTERVAL_MIN,
} from '@/notifications/backgroundTask';
import { appTheme } from '@/theme/theme';

// Keep the native splash up until the database is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    // Boot the database, then register background update checks if enabled.
    (async () => {
     try {
        await getDb();
        const enabled = await getJsonSetting<boolean>(SETTING_ENABLED, true);
        const interval = await getJsonSetting<number>(SETTING_INTERVAL_MIN, 360);
        if (enabled) {
          try {
            await registerUpdateTask(interval);
          } catch {
            // Background fetch may be unavailable (e.g. simulator); ignore.
          }
        }
        } finally {
        await SplashScreen.hideAsync().catch(() => {});
      }
    })();
  }, []);

  useEffect(() => {
    // Tapping an update notification deep-links to the novel.
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const novelId = res.notification.request.content.data?.novelId;
      if (typeof novelId === 'string') {
        router.push({ pathname: '/novel/[id]', params: { id: novelId } });
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: appTheme.surface },
          headerTintColor: appTheme.text,
          contentStyle: { backgroundColor: appTheme.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="novel/[id]" options={{ title: '' }} />
        <Stack.Screen name="reader/[chapterId]" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
