import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NovelCard } from '@/components/NovelCard';
import { getSource, DEFAULT_SOURCE_ID } from '@/source/registry';
import { NovelSummary } from '@/source/types';
import { upsertNovel } from '@/db/novels';
import { appTheme } from '@/theme/theme';

export default function BrowseScreen() {
  const source = getSource(DEFAULT_SOURCE_ID);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<NovelSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const fetchPage = useCallback(
    async (q: string, p: number, append: boolean) => {
      const myReq = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const res = q.trim()
          ? await source.search(q.trim(), p)
          : await source.getLatest(p);
        if (myReq !== reqId.current) return; // stale response, ignore
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setHasMore(res.hasMore);
        setPage(p);
      } catch (e) {
        if (myReq === reqId.current) {
          setError('Could not reach Novel Phoenix. Check your connection.');
          if (!append) setItems([]);
        }
      } finally {
        if (myReq === reqId.current) setLoading(false);
      }
    },
    [source],
  );

  // Load latest on mount.
  useEffect(() => {
    fetchPage('', 1, false);
  }, [fetchPage]);

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => fetchPage(query, 1, false), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const openNovel = useCallback(async (n: NovelSummary) => {
    await upsertNovel(n); // cache summary so detail screen can hydrate by id
    router.push({ pathname: '/novel/[id]', params: { id: n.id } });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={appTheme.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="Search Novel Phoenix…"
          placeholderTextColor={appTheme.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(n, i) => `${n.id}-${i}`}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore && !loading) fetchPage(query, page + 1, true);
        }}
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>
            {query.trim() ? 'Search results' : 'Latest updates'}
          </Text>
        }
        ListFooterComponent={
          loading ? <ActivityIndicator style={{ margin: 20 }} color={appTheme.accent} /> : null
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>No novels found.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <NovelCard
              title={item.title}
              coverUri={item.coverUrl}
              subtitle={item.subtitle}
              onPress={() => openNovel(item)}
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: appTheme.card,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  input: { flex: 1, color: appTheme.text, fontSize: 15, paddingVertical: 10 },
  sectionTitle: {
    color: appTheme.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  error: { color: appTheme.danger, paddingHorizontal: 16, paddingTop: 10, fontSize: 13 },
  grid: { padding: 16, paddingBottom: 32 },
  row: { gap: GAP },
  cell: { flex: 1 / 3, marginBottom: GAP, maxWidth: '31.5%' },
  empty: { color: appTheme.textMuted, textAlign: 'center', marginTop: 40 },
});
