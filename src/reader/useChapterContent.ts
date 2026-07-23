/**
 * Loads a chapter's paragraphs, preferring the on-device download and falling
 * back to a live fetch. A live-fetched chapter is cached to disk so re-reads
 * work offline.
 */
import { useEffect, useState } from 'react';
import { getChapter } from '@/db/chapters';
import { getNovel } from '@/db/novels';
import { getSource } from '@/source/registry';
import { readChapterContent, saveChapterContent } from '@/storage/files';
import { setChapterContentPath } from '@/db/chapters';
import { ChapterRecord } from '@/db/types';

export interface ChapterLoadState {
  loading: boolean;
  error: string | null;
  paragraphs: string[];
  chapter: ChapterRecord | null;
  offline: boolean;
}

export function useChapterContent(chapterId: string | undefined): ChapterLoadState {
  const [state, setState] = useState<ChapterLoadState>({
    loading: true,
    error: null,
    paragraphs: [],
    chapter: null,
    offline: false,
  });

  useEffect(() => {
    let active = true;
    if (!chapterId) return;

    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const chapter = await getChapter(chapterId);
        if (!chapter) throw new Error('Chapter not found');

        // 1. Already downloaded → read from disk.
        if (chapter.contentPath) {
          const content = await readChapterContent(chapter.contentPath);
          if (content && active) {
            setState({
              loading: false,
              error: null,
              paragraphs: content.paragraphs,
              chapter,
              offline: true,
            });
            return;
          }
        }

        // 2. Fetch live, then cache for next time.
        const novel = await getNovel(chapter.novelId);
        if (!novel) throw new Error('Novel not found');
        const source = getSource(novel.sourceId);
        const content = await source.getChapterContent({
          id: chapter.id,
          novelId: chapter.novelId,
          url: chapter.url,
          title: chapter.title,
          order: chapter.orderIndex,
          publishedLabel: chapter.publishedLabel,
        });

        try {
          const path = await saveChapterContent(novel.id, chapter.id, content);
          await setChapterContentPath(chapter.id, path);
        } catch {
          // Caching is best-effort; reading still works without it.
        }

        if (active) {
          setState({
            loading: false,
            error: null,
            paragraphs: content.paragraphs,
            chapter,
            offline: false,
          });
        }
      } catch (e) {
        if (active) {
          setState({
            loading: false,
            error:
              'Could not load this chapter. If you are offline, download it first while connected.',
            paragraphs: [],
            chapter: null,
            offline: false,
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [chapterId]);

  return state;
}
