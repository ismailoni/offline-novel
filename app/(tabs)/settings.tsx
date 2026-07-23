import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getJsonSetting, setJsonSetting } from '@/db/settings';
import {
  registerUpdateTask,
  unregisterUpdateTask,
  SETTING_ENABLED,
  SETTING_INTERVAL_MIN,
} from '@/notifications/backgroundTask';
import { requestNotificationPermission } from '@/notifications/notifications';
import { totalStorageBytes } from '@/storage/files';
import { appTheme } from '@/theme/theme';

const INTERVALS = [
  { label: 'Every hour', minutes: 60 },
  { label: 'Every 3 hours', minutes: 180 },
  { label: 'Every 6 hours', minutes: 360 },
  { label: 'Every 12 hours', minutes: 720 },
  { label: 'Once a day', minutes: 1440 },
];

export default function SettingsScreen() {
  const [enabled, setEnabled] = useState(true);
  const [interval, setInterval] = useState(360);
  const [storage, setStorage] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      setEnabled(await getJsonSetting<boolean>(SETTING_ENABLED, true));
      setInterval(await getJsonSetting<number>(SETTING_INTERVAL_MIN, 360));
      setStorage(await totalStorageBytes());
      setReady(true);
    })();
  }, []);

  const onToggle = useCallback(async (value: boolean) => {
    setEnabled(value);
    await setJsonSetting(SETTING_ENABLED, value);
    if (value) {
      const granted = await requestNotificationPermission();
      if (granted) {
        const mins = await getJsonSetting<number>(SETTING_INTERVAL_MIN, 360);
        try {
          await registerUpdateTask(mins);
        } catch {
          /* background fetch unavailable on this device */
        }
      }
    } else {
      await unregisterUpdateTask();
    }
  }, []);

  const onPickInterval = useCallback(async (minutes: number) => {
    setInterval(minutes);
    await setJsonSetting(SETTING_INTERVAL_MIN, minutes);
    if (enabled) {
      try {
        await registerUpdateTask(minutes);
      } catch {
        /* ignore */
      }
    }
  }, [enabled]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator color={appTheme.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Settings</Text>

        <Text style={styles.sectionLabel}>UPDATE NOTIFICATIONS</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.rowTitle}>Background update checks</Text>
              <Text style={styles.rowSub}>
                Periodically check your library for new chapters and notify you.
                Runs entirely on your phone.
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={onToggle}
              trackColor={{ true: appTheme.accent, false: appTheme.border }}
            />
          </View>
        </View>

        {enabled ? (
          <>
            <Text style={styles.sectionLabel}>CHECK FREQUENCY</Text>
            <View style={styles.card}>
              {INTERVALS.map((opt, i) => (
                <Pressable
                  key={opt.minutes}
                  style={[styles.optionRow, i > 0 && styles.divider]}
                  onPress={() => onPickInterval(opt.minutes)}
                >
                  <Text style={styles.rowTitle}>{opt.label}</Text>
                  <View style={[styles.radio, interval === opt.minutes && styles.radioOn]} />
                </Pressable>
              ))}
            </View>
            <Text style={styles.note}>
              The operating system decides exactly when background checks run, so
              timing is approximate — iOS especially may batch or delay them.
            </Text>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>STORAGE</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.rowTitle}>Downloaded content</Text>
            <Text style={styles.rowValue}>
              {storage == null ? '…' : formatBytes(storage)}
            </Text>
          </View>
          <Text style={styles.rowSub}>
            All novels and chapters are stored locally. Remove a novel from its
            detail screen to free its space.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <Text style={styles.rowSub}>
            Offline Novel reads from novelphoenix.com for your personal offline
            use. No account, no server — your library, reading progress and
            downloads never leave this device.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appTheme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: appTheme.bg },
  content: { padding: 16, paddingBottom: 40 },
  heading: { color: appTheme.text, fontSize: 28, fontWeight: '800', marginBottom: 16 },
  sectionLabel: {
    color: appTheme.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    backgroundColor: appTheme.card,
    borderRadius: 14,
    padding: 16,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { color: appTheme.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: appTheme.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  rowValue: { color: appTheme.accent, fontSize: 15, fontWeight: '700' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.border },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: appTheme.border,
  },
  radioOn: { borderColor: appTheme.accent, backgroundColor: appTheme.accent },
  note: { color: appTheme.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17, paddingHorizontal: 4 },
});
