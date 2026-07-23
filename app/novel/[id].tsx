import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Cover } from '@/components/Cover';
import { getNovel } from '@/db/novels';
import { getChapters } from '@/db/chapters';
import { getProgress } from '@/db/progress';
import { NovelRecord, ChapterRecord, ProgressRecord } from '@/db/types';
import {
  loadAndCacheNovel,
  addToLibrary,
  removeFromLibrary,
} from '@/services/library';
import { clearUpdateFlag } from '@/db/novels';
import {
  downloadNovel,
  cancelDownload,
  isDownloading,
  DownloadProgress,
} from '@/services/download';
import { appTheme } from '@/theme/theme';

export default function NovelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [novel, setNovel] = useState<NovelRecord | null>(null);
  const [chapters, setChapters] = useState<ChapterRecord[]>([]);
  const [progress, setProgress] = useState<ProgressRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dl, setDl] = useState<DownloadProgress | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  const hydrate = useCallback(async () => {
    if (!id) return;
    const [n, chs, prog] = await Promise.all([
      getNovel(id),
      getChapters(id),
      getProgress(id),
    ]);
    setNovel(n);
    setChapters(chs);
    setProgress(prog);
  }, [id]);

  const refresh = useCallback(async () => {
    if (!id) return;
    const existing = await getNovel(id);
    if (!existing) return;
    setRefreshing(true);
    try {
      await loadAndCacheNovel(existing.sourceId, existing.url);
      await clearUpdateFlag(id);
      await hydrate();
    } catch {
      // keep cached data on failure
    } finally {
      setRefreshing(false);
    }
  }, [id, hydrate]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await hydrate();
        setLoading(false);
        // Refresh chapter list in the background on first open.
        refresh();
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]),
  );

  const toggleLibrary = useCallback(async () => {
    if (!novel) return;
    if (novel.inLibrary) {
      Alert.alert('Remove from library?', 'Keep downloaded chapters on device?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Keep files',
          onPress: async () => {
            await removeFromLibrary(novel.id, false);
            hydrate();
          },
        },
        {
          text: 'Delete files',
          style: 'destructive',
          onPress: async () => {
            await removeFromLibrary(novel.id, true);
            hydrate();
          },
        },
      ]);
    } else {
      await addToLibrary(novel.id);
      hydrate();
    }
  }, [novel, hydrate]);

  const startDownloadAll = useCallback(async () => {
    if (!novel) return;
    if (isDownloading(novel.id)) {
      cancelDownload(novel.id);
      return;
    }
    setDl({ total: 0, completed: 0, failed: 0 });
    await downloadNovel(novel.id, (p) => setDl({ ...p }));
    setDl(null);
    hydrate();
  }, [novel, hydrate]);

  const openChapter = useCallback((chapter: ChapterRecord) => {
    router.push({ pathname: '/reader/[chapterId]', params: { chapterId: chapter.id } });
  }, []);

  const resumeReading = useCallback(() => {
    if (progress) {
      router.push({ pathname: '/reader/[chapterId]', params: { chapterId: progress.chapterId } });
    } else if (chapters[0]) {
      openChapter(chapters[0]);
    }
  }, [progress, chapters, openChapter]);

  if (loading || !novel) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={appTheme.accent} />
      </View>
    );
  }

  const downloadedCount = chapters.filter((c) => c.contentPath).length;

  return (
    <>
      <Stack.Screen options={{ title: novel.title, headerBackTitle: 'Back' }} />
      <FlatList
        style={styles.container}
        data={chapters}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Cover uri={novel.coverPath ?? novel.coverUrl} title={novel.title} style={styles.cover} />
              <View style={styles.heroInfo}>
                <Text style={styles.title}>{novel.title}</Text>
                {novel.author ? <Text style={styles.author}>{novel.author}</Text> : null}
                {novel.status ? (
                  <View style={styles.statusPill}>
                    <Text style={styles.statusText}>{novel.status}</Text>
                  </View>
                ) : null}
                <Text style={styles.meta}>
                  {chapters.length} chapters · {downloadedCount} downloaded
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={resumeReading}>
                <Ionicons name="book" size={16} color={appTheme.accentText} />
                <Text style={styles.btnPrimaryText}>
                  {progress ? `Continue Ch. ${progress.chapterOrder}` : 'Start reading'}
                </Text>
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={toggleLibrary}>
                <Ionicons
                  name={novel.inLibrary ? 'heart' : 'heart-outline'}
                  size={22}
                  color={novel.inLibrary ? appTheme.accent : appTheme.text}
                />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={startDownloadAll}>
                <Ionicons
                  name={dl ? 'stop-circle' : 'download-outline'}
                  size={22}
                  color={appTheme.text}
                />
              </Pressable>
            </View>

            {dl ? (
              <Text style={styles.dlStatus}>
                Downloading {dl.completed}/{dl.total}
                {dl.failed ? ` · ${dl.failed} failed` : ''}
                {dl.currentTitle ? ` · ${dl.currentTitle}` : ''}
              </Text>
            ) : null}

            {novel.description ? (
              <Pressable onPress={() => setDescExpanded((v) => !v)}>
                <Text style={styles.desc} numberOfLines={descExpanded ? undefined : 4}>
                  {novel.description}
                </Text>
                <Text style={styles.descToggle}>{descExpanded ? 'Show less' : 'Show more'}</Text>
              </Pressable>
            ) : null}

            {novel.genres.length > 0 ? (
              <View style={styles.genres}>
                {novel.genres.map((g) => (
                  <View key={g} style={styles.genreChip}>
                    <Text style={styles.genreText}>{g}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.chaptersHeader}>
              <Text style={styles.chaptersTitle}>Chapters</Text>
              {refreshing ? <ActivityIndicator size="small" color={appTheme.accent} /> : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          !refreshing ? (
            <Text style={styles.emptyChapters}>
              No chapters loaded yet. Pull the novel again once you have a
              connection.
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const isCurrent = progress?.chapterId === item.id;
          return (
            <Pressable
              style={styles.chapterRow}
              onPress={() => openChapter(item)}
              android_ripple={{ color: '#222' }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.chapterTitle, isCurrent && styles.chapterCurrent]} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.publishedLabel ? (
                  <Text style={styles.chapterDate}>{item.publishedLabel}</Text>
                ) : null}
              </View>
              {item.contentPath ? (
                <Ionicons name="checkmark-circle" size={18} color={appTheme.accent} />
              ) : (
                <Ionicons name="cloud-outline" size={18} color={appTheme.textMuted} />
              )}
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appTheme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: appTheme.bg },
  hero: { flexDirection: 'row', padding: 16, gap: 16 },
  cover: { width: 110, height: 165 },
  heroInfo: { flex: 1, justifyContent: 'flex-start' },
  title: { color: appTheme.text, fontSize: 20, fontWeight: '800' },
  author: { color: appTheme.textMuted, fontSize: 14, marginTop: 4 },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: appTheme.card,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  statusText: { color: appTheme.text, fontSize: 12, fontWeight: '600' },
  meta: { color: appTheme.textMuted, fontSize: 12, marginTop: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 12 },
  btnPrimary: { flex: 1, backgroundColor: appTheme.accent },
  btnPrimaryText: { color: appTheme.accentText, fontWeight: '700', fontSize: 15 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: appTheme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dlStatus: { color: appTheme.textMuted, fontSize: 12, paddingHorizontal: 16, marginTop: 10 },
  desc: { color: appTheme.text, fontSize: 14, lineHeight: 21, paddingHorizontal: 16, marginTop: 16 },
  descToggle: { color: appTheme.accent, fontSize: 13, fontWeight: '600', paddingHorizontal: 16, marginTop: 4 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 14 },
  genreChip: { backgroundColor: appTheme.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  genreText: { color: appTheme.textMuted, fontSize: 12 },
  chaptersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  chaptersTitle: { color: appTheme.text, fontSize: 18, fontWeight: '700' },
  emptyChapters: { color: appTheme.textMuted, textAlign: 'center', padding: 24, lineHeight: 20 },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appTheme.border,
  },
  chapterTitle: { color: appTheme.text, fontSize: 14 },
  chapterCurrent: { color: appTheme.accent, fontWeight: '700' },
  chapterDate: { color: appTheme.textMuted, fontSize: 11, marginTop: 3 },
});
