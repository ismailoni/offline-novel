import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Keyboard,
  Modal,
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
  downloadChapters,
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
  // True when the last chapter-list sync couldn't fetch the whole list (e.g.
  // the source rate-limited us). Drives the "list may be incomplete" banner.
  const [incomplete, setIncomplete] = useState(false);
  const [dl, setDl] = useState<DownloadProgress | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [showDlOptions, setShowDlOptions] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  // Chapter list paging so long novels don't scroll endlessly.
  const CHAPTERS_PER_PAGE = 100;
  const [chapterPage, setChapterPage] = useState(0);
  const [orderAsc, setOrderAsc] = useState(true);
  const [gotoText, setGotoText] = useState('');

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
      const res = await loadAndCacheNovel(existing.sourceId, existing.url);
      await clearUpdateFlag(id);
      await hydrate();
      // Full crawl -> the list is authoritative; partial crawl -> flag it so
      // the user knows what they're seeing isn't the whole list.
      setIncomplete(!res.complete);
    } catch {
      // Refresh failed outright (offline, or page 1 unreachable). Keep whatever
      // is cached; only warn about completeness when we have nothing to show.
      setIncomplete((prev) => prev || chapters.length === 0);
    } finally {
      setRefreshing(false);
    }
  }, [id, hydrate, chapters.length]);

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

  // The download control cancels an in-flight download, otherwise it opens the
  // custom-download options sheet.
  const onDownloadPress = useCallback(() => {
    if (!novel) return;
    if (isDownloading(novel.id)) {
      cancelDownload(novel.id);
      return;
    }
    setRangeFrom('');
    setRangeTo('');
    setShowDlOptions(true);
  }, [novel]);

  const runDownload = useCallback(
    async (subset: ChapterRecord[]) => {
      if (!novel) return;
      setShowDlOptions(false);
      const pending = subset.filter((c) => !c.contentPath);
      if (pending.length === 0) {
        Alert.alert('Nothing to download', 'Those chapters are already saved on your device.');
        return;
      }
      setDl({ total: pending.length, completed: 0, failed: 0 });
      await downloadChapters(novel.id, subset, (p) => setDl({ ...p }));
      setDl(null);
      hydrate();
    },
    [novel, hydrate],
  );

  const downloadRange = useCallback(() => {
    const from = parseInt(rangeFrom.trim(), 10);
    const to = parseInt(rangeTo.trim(), 10);
    const max = chapters.length;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to > max || from > to) {
      Alert.alert('Invalid range', `Enter a range between 1 and ${max}, with "from" no greater than "to".`);
      return;
    }
    runDownload(chapters.slice(from - 1, to));
  }, [rangeFrom, rangeTo, chapters, runDownload]);

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

  // Ordered chapter list + jump helpers. Declared before the early return so
  // hook order stays stable across the loading/loaded transition.
  const listRef = useRef<FlatList<ChapterRecord>>(null);
  const orderedChapters = useMemo(
    () => (orderAsc ? chapters : [...chapters].reverse()),
    [chapters, orderAsc],
  );
  const pageCount = Math.max(1, Math.ceil(orderedChapters.length / CHAPTERS_PER_PAGE));
  const page = Math.min(chapterPage, pageCount - 1);
  const pageStart = page * CHAPTERS_PER_PAGE;
  const pageChapters = orderedChapters.slice(pageStart, pageStart + CHAPTERS_PER_PAGE);

  // Start each newly-selected chapter page from the top of the list.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [page]);

  const goToChapterNumber = useCallback(() => {
    const n = parseInt(gotoText.trim(), 10);
    Keyboard.dismiss();
    if (!Number.isFinite(n) || n < 1 || n > chapters.length) {
      Alert.alert('Go to chapter', `Enter a chapter number between 1 and ${chapters.length}.`);
      return;
    }
    // Chapter n lives at ordered position (n-1) when ascending, mirrored when
    // descending — translate to the page that contains it.
    const orderedIndex = orderAsc ? n - 1 : chapters.length - n;
    setChapterPage(Math.floor(orderedIndex / CHAPTERS_PER_PAGE));
    setGotoText('');
  }, [gotoText, chapters.length, orderAsc]);

  const jumpToCurrent = useCallback(() => {
    if (!progress) return;
    const orderedIndex = orderAsc
      ? progress.chapterOrder - 1
      : chapters.length - progress.chapterOrder;
    if (orderedIndex >= 0) setChapterPage(Math.floor(orderedIndex / CHAPTERS_PER_PAGE));
  }, [progress, orderAsc, chapters.length]);

  if (loading || !novel) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={appTheme.accent} />
      </View>
    );
  }

  const downloadedCount = chapters.filter((c) => c.contentPath).length;


  const renderPageNav = () =>
    pageCount > 1 ? (
      <View style={styles.pager}>
        <Pressable
          style={[styles.pagerBtn, page === 0 && styles.pagerBtnDisabled]}
          onPress={() => setChapterPage(0)}
          disabled={page === 0}
        >
          <Ionicons name="play-skip-back" size={16} color={appTheme.text} />
        </Pressable>
        <Pressable
          style={[styles.pagerBtn, page === 0 && styles.pagerBtnDisabled]}
          onPress={() => setChapterPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          <Ionicons name="chevron-back" size={16} color={appTheme.text} />
        </Pressable>
        <Text style={styles.pagerLabel}>
          Page {page + 1} / {pageCount}
        </Text>
        <Pressable
          style={[styles.pagerBtn, page >= pageCount - 1 && styles.pagerBtnDisabled]}
          onPress={() => setChapterPage((p) => Math.min(pageCount - 1, p + 1))}
          disabled={page >= pageCount - 1}
        >
          <Ionicons name="chevron-forward" size={16} color={appTheme.text} />
        </Pressable>
        <Pressable
          style={[styles.pagerBtn, page >= pageCount - 1 && styles.pagerBtnDisabled]}
          onPress={() => setChapterPage(pageCount - 1)}
          disabled={page >= pageCount - 1}
        >
          <Ionicons name="play-skip-forward" size={16} color={appTheme.text} />
        </Pressable>
      </View>
    ) : null;

  return (
    <>
      <Stack.Screen options={{ title: novel.title, headerBackTitle: 'Back' }} />
      <FlatList
        ref={listRef}
        style={styles.container}
        data={pageChapters}
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
              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={resumeReading}
                accessibilityRole="button"
                accessibilityLabel={progress ? `Continue chapter ${progress.chapterOrder}` : 'Start reading'}
              >
                <Ionicons name="book" size={16} color={appTheme.accentText} />
                <Text style={styles.btnPrimaryText}>
                  {progress ? `Continue Ch. ${progress.chapterOrder}` : 'Start reading'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={toggleLibrary}
                accessibilityRole="button"
                accessibilityLabel={novel.inLibrary ? 'Remove from library' : 'Add to library'}
              >
                <Ionicons
                  name={novel.inLibrary ? 'heart' : 'heart-outline'}
                  size={22}
                  color={novel.inLibrary ? appTheme.accent : appTheme.text}
                />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={onDownloadPress}
                accessibilityRole="button"
                accessibilityLabel={dl ? 'Stop download' : 'Download chapters'}
              >
                <Ionicons
                  name={dl ? 'stop-circle' : 'download-outline'}
                  size={22}
                  color={dl ? appTheme.danger : appTheme.text}
                />
              </Pressable>
            </View>

            {dl ? (
              <View style={styles.dlWrap}>
                <Text style={styles.dlStatus}>
                  Downloading {dl.completed}/{dl.total}
                  {dl.failed ? ` · ${dl.failed} failed` : ''}
                  {dl.currentTitle ? ` · ${dl.currentTitle}` : ''}
                </Text>
                <View style={styles.dlTrack}>
                  <View
                    style={[
                      styles.dlFill,
                      { width: `${dl.total > 0 ? Math.round((dl.completed / dl.total) * 100) : 0}%` },
                    ]}
                  />
                </View>
              </View>
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
              <View style={{ flex: 1 }} />
              <Pressable
                style={styles.orderBtn}
                onPress={() => {
                  setOrderAsc((v) => !v);
                  setChapterPage(0);
                }}
                hitSlop={8}
              >
                <Ionicons
                  name={orderAsc ? 'arrow-down' : 'arrow-up'}
                  size={14}
                  color={appTheme.text}
                />
                <Text style={styles.orderText}>{orderAsc ? 'Oldest' : 'Newest'}</Text>
              </Pressable>
            </View>

            {incomplete ? (
              <View style={styles.incompleteBanner}>
                <Ionicons name="warning-outline" size={18} color={appTheme.danger} />
                <Text style={styles.incompleteText}>
                  Couldn't load the full chapter list — the source may be rate
                  limiting. {chapters.length > 0 ? 'The list below may be incomplete.' : ''}
                </Text>
                <Pressable
                  style={styles.retryBtn}
                  onPress={refresh}
                  disabled={refreshing}
                  hitSlop={6}
                >
                  <Text style={styles.retryText}>{refreshing ? 'Retrying…' : 'Retry'}</Text>
                </Pressable>
              </View>
            ) : null}

            {chapters.length > 0 ? (
              <View style={styles.gotoRow}>
                <View style={styles.gotoInputWrap}>
                  <Ionicons name="search" size={15} color={appTheme.textMuted} />
                  <TextInput
                    style={styles.gotoInput}
                    value={gotoText}
                    onChangeText={setGotoText}
                    onSubmitEditing={goToChapterNumber}
                    keyboardType="number-pad"
                    returnKeyType="go"
                    placeholder={`Go to chapter (1–${chapters.length})`}
                    placeholderTextColor={appTheme.textMuted}
                  />
                  {gotoText ? (
                    <Pressable onPress={goToChapterNumber} hitSlop={8}>
                      <Ionicons name="arrow-forward-circle" size={22} color={appTheme.accent} />
                    </Pressable>
                  ) : null}
                </View>
                {progress ? (
                  <Pressable style={styles.gotoCurrentBtn} onPress={jumpToCurrent} hitSlop={6}>
                    <Ionicons name="bookmark" size={14} color={appTheme.accentText} />
                    <Text style={styles.gotoCurrentText}>Ch. {progress.chapterOrder}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {renderPageNav()}
          </View>
        }
        ListFooterComponent={pageChapters.length > 0 ? renderPageNav() : null}
        ListEmptyComponent={
          refreshing ? (
            <View style={styles.emptyLoading}>
              <ActivityIndicator color={appTheme.accent} />
              <Text style={styles.emptyChapters}>Loading all chapters…</Text>
            </View>
          ) : incomplete ? (
            <Text style={styles.emptyChapters}>
              No chapters could be loaded. Tap Retry above once you have a
              stable connection.
            </Text>
          ) : (
            <Text style={styles.emptyChapters}>
              No chapters loaded yet. Pull the novel again once you have a
              connection.
            </Text>
          )
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

      <Modal
        visible={showDlOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDlOptions(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDlOptions(false)}>
          <Pressable style={styles.sheet} onPress={() => Keyboard.dismiss()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Download chapters</Text>
            <Text style={styles.sheetSub}>
              {chapters.length - downloadedCount} of {chapters.length} not yet downloaded.
            </Text>

            <Pressable
              style={styles.dlOption}
              onPress={() => runDownload(chapters)}
              android_ripple={{ color: '#222' }}
            >
              <Ionicons name="cloud-download-outline" size={20} color={appTheme.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dlOptionTitle}>All remaining</Text>
                <Text style={styles.dlOptionSub}>Every chapter not already on your device</Text>
              </View>
            </Pressable>

            {progress ? (
              <Pressable
                style={styles.dlOption}
                onPress={() => runDownload(chapters.slice(Math.max(0, progress.chapterOrder - 1)))}
                android_ripple={{ color: '#222' }}
              >
                <Ionicons name="bookmark-outline" size={20} color={appTheme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dlOptionTitle}>From where I'm reading</Text>
                  <Text style={styles.dlOptionSub}>Ch. {progress.chapterOrder} to the end</Text>
                </View>
              </Pressable>
            ) : null}

            <View style={styles.dlRangeLabelRow}>
              <Ionicons name="options-outline" size={20} color={appTheme.accent} />
              <Text style={styles.dlOptionTitle}>Custom range</Text>
            </View>
            <View style={styles.dlRangeRow}>
              <TextInput
                style={styles.rangeInput}
                value={rangeFrom}
                onChangeText={setRangeFrom}
                keyboardType="number-pad"
                placeholder="From"
                placeholderTextColor={appTheme.textMuted}
              />
              <Text style={styles.rangeDash}>–</Text>
              <TextInput
                style={styles.rangeInput}
                value={rangeTo}
                onChangeText={setRangeTo}
                keyboardType="number-pad"
                placeholder="To"
                placeholderTextColor={appTheme.textMuted}
              />
              <Pressable
                style={styles.rangeGoBtn}
                onPress={downloadRange}
                accessibilityRole="button"
                accessibilityLabel="Download chapter range"
              >
                <Text style={styles.rangeGoText}>Download</Text>
              </Pressable>
            </View>

            <Pressable style={styles.dlCancel} onPress={() => setShowDlOptions(false)}>
              <Text style={styles.dlCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  dlWrap: { paddingHorizontal: 16, marginTop: 10 },
  dlStatus: { color: appTheme.textMuted, fontSize: 12 },
  dlTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: appTheme.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  dlFill: { height: '100%', borderRadius: 2, backgroundColor: appTheme.accent },
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
  orderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: appTheme.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  orderText: { color: appTheme.text, fontSize: 12, fontWeight: '600' },
  gotoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 4, marginBottom: 4 },
  gotoInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: appTheme.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
  },
  gotoInput: { flex: 1, color: appTheme.text, fontSize: 14, paddingVertical: 0 },
  gotoCurrentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: appTheme.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
  },
  gotoCurrentText: { color: appTheme.accentText, fontSize: 13, fontWeight: '700' },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pagerBtn: {
    width: 40,
    height: 36,
    borderRadius: 9,
    backgroundColor: appTheme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerBtnDisabled: { opacity: 0.35 },
  pagerLabel: { color: appTheme.text, fontSize: 13, fontWeight: '600', minWidth: 96, textAlign: 'center' },
  emptyLoading: { alignItems: 'center', paddingTop: 24, gap: 12 },
  emptyChapters: { color: appTheme.textMuted, textAlign: 'center', padding: 24, lineHeight: 20 },
  incompleteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: appTheme.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appTheme.danger,
  },
  incompleteText: { flex: 1, color: appTheme.text, fontSize: 12, lineHeight: 17 },
  retryBtn: {
    backgroundColor: appTheme.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  retryText: { color: appTheme.accentText, fontSize: 13, fontWeight: '700' },
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

  modalBackdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: appTheme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: appTheme.border,
    marginBottom: 14,
  },
  sheetTitle: { color: appTheme.text, fontSize: 18, fontWeight: '800' },
  sheetSub: { color: appTheme.textMuted, fontSize: 13, marginTop: 4, marginBottom: 12 },
  dlOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: appTheme.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  dlOptionTitle: { color: appTheme.text, fontSize: 15, fontWeight: '600' },
  dlOptionSub: { color: appTheme.textMuted, fontSize: 12, marginTop: 2 },
  dlRangeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4, marginBottom: 8 },
  dlRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeInput: {
    flex: 1,
    backgroundColor: appTheme.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: appTheme.text,
    fontSize: 15,
    textAlign: 'center',
  },
  rangeDash: { color: appTheme.textMuted, fontSize: 16 },
  rangeGoBtn: {
    backgroundColor: appTheme.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rangeGoText: { color: appTheme.accentText, fontWeight: '700', fontSize: 14 },
  dlCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  dlCancelText: { color: appTheme.textMuted, fontSize: 15, fontWeight: '600' },
});
