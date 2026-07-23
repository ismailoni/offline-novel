/**
 * Background update checks. Registers a TaskManager task run periodically by
 * expo-background-fetch. On each run it sweeps the library for new chapters
 * and fires a local notification. Timing is controlled by the OS — iOS in
 * particular treats the interval as a hint, not a guarantee.
 */
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { checkLibrary } from '@/services/updates';
import { notifyUpdates } from './notifications';
import { getJsonSetting } from '@/db/settings';

export const UPDATE_TASK = 'offlinenovel-update-check';
export const SETTING_INTERVAL_MIN = 'updateIntervalMinutes';
export const SETTING_ENABLED = 'backgroundUpdatesEnabled';

TaskManager.defineTask(UPDATE_TASK, async () => {
  try {
    const enabled = await getJsonSetting<boolean>(SETTING_ENABLED, true);
    if (!enabled) return BackgroundFetch.BackgroundFetchResult.NoData;

    const results = await checkLibrary();
    if (results.length > 0) {
      await notifyUpdates(results);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/** Register (or re-register) the periodic task with the desired interval. */
export async function registerUpdateTask(intervalMinutes: number): Promise<void> {
  const seconds = Math.max(15, intervalMinutes) * 60;
  await BackgroundFetch.registerTaskAsync(UPDATE_TASK, {
    minimumInterval: seconds,
    stopOnTerminate: false, // Android: keep running after app is closed
    startOnBoot: true,
  });
}

export async function unregisterUpdateTask(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(UPDATE_TASK);
  if (registered) await BackgroundFetch.unregisterTaskAsync(UPDATE_TASK);
}

export async function isUpdateTaskRegistered(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(UPDATE_TASK);
}
