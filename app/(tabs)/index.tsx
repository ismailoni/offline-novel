import { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NovelCard } from '@/components/NovelCard';
import { checkLibrary } from '@/services/updates';
import { notifyUpdates } from '@/notifications/notifications';
import { getLibraryWithProgress, LibraryEntry } from '@/db/novels';
import { appTheme } from '@/theme/theme';

export default function LibraryScreen() {
  const [novels, setNovels] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setNovels(await getLibraryWithProgress());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const results = await checkLibrary((title) => setStatus(`Checking ${title}…`));
      await notifyUpdates(results);
      await load();
    } finally {
      setStatus(null);
      setRefreshing(false);
    }
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator color={appTheme.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Library</Text>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>
      <FlatList
        data={novels}
        keyExtractor={(n) => n.id}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={appTheme.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Your library is empty</Text>
            <Text style={styles.emptyText}>
              Head to Browse, open a novel, and tap “Add to library”. Pull down
              here to check your saved novels for new chapters.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <NovelCard
              title={item.title}
              coverUri={item.coverPath ?? item.coverUrl}
              subtitle={item.status ?? item.author}
              badge={item.hasUpdates ? 'NEW' : undefined}
              progress={item.readFraction}
              onPress={() =>
                router.push({ pathname: '/novel/[id]', params: { id: item.id } })
              }
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const GAP = 12;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appTheme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: appTheme.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  heading: { color: appTheme.text, fontSize: 28, fontWeight: '800' },
  status: { color: appTheme.textMuted, fontSize: 12, marginTop: 2 },
  grid: { padding: 16, paddingBottom: 32 },
  row: { gap: GAP },
  cell: { flex: 1 / 3, marginBottom: GAP, maxWidth: '31.5%' },
  empty: { paddingTop: 80, paddingHorizontal: 24, alignItems: 'center' },
  emptyTitle: { color: appTheme.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: appTheme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
