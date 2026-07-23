/**
 * Local notifications. Everything is on-device: no push server, no accounts.
 * When the background task finds new chapters it fires a local notification
 * that deep-links into the relevant novel.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { UpdateResult } from '@/services/updates';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('updates', {
    name: 'Novel updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 100, 200],
    lightColor: '#7c5cff',
  });
}

/** Fire a notification summarising update results. */
export async function notifyUpdates(results: UpdateResult[]): Promise<void> {
  if (results.length === 0) return;
  await ensureAndroidChannel();

  if (results.length === 1) {
    const r = results[0];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: r.title,
        body: `${r.newChapters} new chapter${r.newChapters > 1 ? 's' : ''} available`,
        data: { novelId: r.novelId },
      },
      trigger: { channelId: 'updates' },
    });
    return;
  }

  const totalNew = results.reduce((sum, r) => sum + r.newChapters, 0);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${results.length} novels updated`,
      body: `${totalNew} new chapters across your library`,
      data: { novelId: results[0].novelId },
    },
    trigger: { channelId: 'updates' },
  });
}
