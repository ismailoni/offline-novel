import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StatusBar as RNStatusBar,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useChapterContent } from '@/reader/useChapterContent';
import { useReaderSettings } from '@/reader/readerStore';
import { getChapters } from '@/db/chapters';
import { saveProgress, getProgress } from '@/db/progress';
import { ChapterRecord } from '@/db/types';
import { READER_THEMES, FONT_FAMILIES, appTheme, ReaderThemeId } from '@/theme/theme';

export default function ReaderScreen() {
  const { chapterId } = useLocalSearchParams<{ chapterId: string }>();
  const { loading, error, paragraphs, chapter, offline } = useChapterContent(chapterId);
  const settings = useReaderSettings();
  const reader = READER_THEMES[settings.theme];

  const scrollRef = useRef<ScrollView>(null);
  const [siblings, setSiblings] = useState<ChapterRecord[]>([]);
  const [showTools, setShowTools] = useState(false);
  const restoredRef = useRef(false);
  const lastSavedY = useRef(0);

  // Load sibling chapters for prev/next navigation.
  useEffect(() => {
    if (chapter) getChapters(chapter.novelId).then(setSiblings);
  }, [chapter]);

  // Keep-awake while reading, if the user enabled it.
  useEffect(() => {
    if (settings.keepAwake) activateKeepAwakeAsync('reader');
    return () => {
      deactivateKeepAwake('reader');
    };
  }, [settings.keepAwake]);

  // Restore scroll position once content is laid out.
  const onContentSizeChange = useCallback(async () => {
    if (restoredRef.current || !chapter) return;
    const prog = await getProgress(chapter.novelId);
    if (prog && prog.chapterId === chapter.id && prog.scrollOffset > 0) {
      scrollRef.current?.scrollTo({ y: prog.scrollOffset, animated: false });
    }
    restoredRef.current = true;
  }, [chapter]);

  // Persist reading position (throttled).
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!chapter) return;
      const y = e.nativeEvent.contentOffset.y;
      if (Math.abs(y - lastSavedY.current) < 200) return;
      lastSavedY.current = y;
      saveProgress({
        novelId: chapter.novelId,
        chapterId: chapter.id,
        chapterOrder: chapter.orderIndex,
        scrollOffset: y,
      });
    },
    [chapter],
  );

  const go = useCallback(
    (delta: number) => {
      if (!chapter) return;
      const idx = siblings.findIndex((c) => c.id === chapter.id);
      const next = siblings[idx + delta];
      if (next) {
        restoredRef.current = true; // don't restore into a fresh chapter
        router.replace({ pathname: '/reader/[chapterId]', params: { chapterId: next.id } });
      }
    },
    [chapter, siblings],
  );

  const idx = chapter ? siblings.findIndex((c) => c.id === chapter.id) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < siblings.length - 1;

  return (
    <View style={[styles.root, { backgroundColor: reader.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <RNStatusBar hidden={!showTools} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={appTheme.accent} />
        </View>
      ) : error ? (
        <SafeAreaView style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={reader.muted} />
          <Text style={[styles.errorText, { color: reader.text }]}>{error}</Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </SafeAreaView>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={100}
            onContentSizeChange={onContentSizeChange}
            contentContainerStyle={{
              paddingHorizontal: settings.marginH,
              paddingVertical: 60,
            }}
          >
            <Pressable onPress={() => setShowTools((v) => !v)}>
              <Text style={[styles.chapterHeading, { color: reader.text }]}>
                {chapter?.title}
              </Text>
              {offline ? (
                <Text style={[styles.offlineTag, { color: reader.muted }]}>Offline copy</Text>
              ) : null}
              {paragraphs.map((p, i) => (
                <Text
                  key={i}
                  style={{
                    color: reader.text,
                    fontSize: settings.fontSize,
                    lineHeight: settings.fontSize * settings.lineHeight,
                    fontFamily: settings.fontFamily,
                    marginBottom: settings.fontSize * 0.9,
                  }}
                >
                  {p}
                </Text>
              ))}
            </Pressable>

            <View style={styles.navRow}>
              <Pressable
                style={[styles.navBtn, !hasPrev && styles.navDisabled]}
                onPress={() => go(-1)}
                disabled={!hasPrev}
              >
                <Ionicons name="chevron-back" size={18} color={reader.text} />
                <Text style={[styles.navText, { color: reader.text }]}>Previous</Text>
              </Pressable>
              <Pressable
                style={[styles.navBtn, !hasNext && styles.navDisabled]}
                onPress={() => go(1)}
                disabled={!hasNext}
              >
                <Text style={[styles.navText, { color: reader.text }]}>Next</Text>
                <Ionicons name="chevron-forward" size={18} color={reader.text} />
              </Pressable>
            </View>
          </ScrollView>

          {showTools ? (
            <ReaderTools reader={reader.id} onClose={() => setShowTools(false)} />
          ) : null}
        </>
      )}
    </View>
  );
}

function ReaderTools({ reader, onClose }: { reader: ReaderThemeId; onClose: () => void }) {
  const s = useReaderSettings();
  return (
    <SafeAreaView style={styles.toolsWrap} edges={['top', 'bottom']} pointerEvents="box-none">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={appTheme.text} />
        </Pressable>
        <Pressable onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={24} color={appTheme.text} />
        </Pressable>
      </View>

      <View style={styles.panel}>
        {/* Font size */}
        <View style={styles.toolRow}>
          <Text style={styles.toolLabel}>Text size</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => s.setFontSize(s.fontSize - 1)}>
              <Text style={styles.stepText}>A−</Text>
            </Pressable>
            <Text style={styles.stepValue}>{s.fontSize}</Text>
            <Pressable style={styles.stepBtn} onPress={() => s.setFontSize(s.fontSize + 1)}>
              <Text style={styles.stepText}>A+</Text>
            </Pressable>
          </View>
        </View>

        {/* Line spacing */}
        <View style={styles.toolRow}>
          <Text style={styles.toolLabel}>Line spacing</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => s.setLineHeight(s.lineHeight - 0.1)}>
              <Ionicons name="remove" size={16} color={appTheme.text} />
            </Pressable>
            <Text style={styles.stepValue}>{s.lineHeight.toFixed(1)}</Text>
            <Pressable style={styles.stepBtn} onPress={() => s.setLineHeight(s.lineHeight + 0.1)}>
              <Ionicons name="add" size={16} color={appTheme.text} />
            </Pressable>
          </View>
        </View>

        {/* Margins */}
        <View style={styles.toolRow}>
          <Text style={styles.toolLabel}>Margins</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => s.setMarginH(s.marginH - 4)}>
              <Ionicons name="contract" size={16} color={appTheme.text} />
            </Pressable>
            <Text style={styles.stepValue}>{s.marginH}</Text>
            <Pressable style={styles.stepBtn} onPress={() => s.setMarginH(s.marginH + 4)}>
              <Ionicons name="expand" size={16} color={appTheme.text} />
            </Pressable>
          </View>
        </View>

        {/* Theme */}
        <View style={styles.toolRow}>
          <Text style={styles.toolLabel}>Theme</Text>
          <View style={styles.themeRow}>
            {Object.values(READER_THEMES).map((t) => (
              <Pressable
                key={t.id}
                onPress={() => s.setTheme(t.id)}
                style={[
                  styles.themeSwatch,
                  { backgroundColor: t.bg },
                  reader === t.id && styles.themeSwatchOn,
                ]}
              >
                <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>Aa</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Typeface */}
        <View style={styles.toolRow}>
          <Text style={styles.toolLabel}>Font</Text>
          <View style={styles.themeRow}>
            {FONT_FAMILIES.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => s.setFontFamily(f.value)}
                style={[styles.fontChip, s.fontFamily === f.value && styles.fontChipOn]}
              >
                <Text style={{ color: appTheme.text, fontFamily: f.value, fontSize: 13 }}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Keep awake */}
        <Pressable style={styles.toolRow} onPress={() => s.setKeepAwake(!s.keepAwake)}>
          <Text style={styles.toolLabel}>Keep screen on</Text>
          <Ionicons
            name={s.keepAwake ? 'toggle' : 'toggle-outline'}
            size={30}
            color={s.keepAwake ? appTheme.accent : appTheme.textMuted}
          />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  errorText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  backBtn: { backgroundColor: appTheme.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnText: { color: appTheme.accentText, fontWeight: '700' },
  chapterHeading: { fontSize: 20, fontWeight: '800', marginBottom: 20 },
  offlineTag: { fontSize: 12, marginTop: -12, marginBottom: 16 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, gap: 12 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 8 },
  navDisabled: { opacity: 0.3 },
  navText: { fontSize: 15, fontWeight: '600' },

  toolsWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: appTheme.surface + 'ee',
  },
  panel: {
    backgroundColor: appTheme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 4,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  toolLabel: { color: appTheme.text, fontSize: 15, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 40,
    height: 34,
    borderRadius: 8,
    backgroundColor: appTheme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: appTheme.text, fontWeight: '700', fontSize: 14 },
  stepValue: { color: appTheme.text, fontSize: 15, minWidth: 34, textAlign: 'center' },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeSwatch: {
    width: 40,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeSwatchOn: { borderColor: appTheme.accent },
  fontChip: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 8,
    backgroundColor: appTheme.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  fontChipOn: { borderColor: appTheme.accent },
});
