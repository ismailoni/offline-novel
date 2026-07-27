/**
 * Offline download service. Fetches chapter text from the source and writes it
 * to disk, updating each chapter's content_path. Supports single-chapter and
 * whole-novel downloads with progress callbacks and cancellation.
 */
import { getSource } from '@/source/registry';
import { ChapterMeta } from '@/source/types';
import * as chaptersDb from '@/db/chapters';
import * as novelsDb from '@/db/novels';
import { ChapterRecord } from '@/db/types';
import { saveChapterContent, deleteChapterFile } from '@/storage/files';

export interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
  currentTitle?: string;
}

const inFlight = new Map<string, { cancelled: boolean }>();

function toMeta(novelId: string, sourceId: string, c: ChapterRecord): ChapterMeta {
  return {
    id: c.id,
    novelId,
    url: c.url,
    title: c.title,
    order: c.orderIndex,
    publishedLabel: c.publishedLabel,
  };
}

export async function downloadChapter(chapterId: string): Promise<void> {
  const chapter = await chaptersDb.getChapter(chapterId);
  if (!chapter) throw new Error('Chapter not found');
  if (chapter.contentPath) return; // already downloaded

  const novel = await novelsDb.getNovel(chapter.novelId);
  if (!novel) throw new Error('Novel not found');

  const source = getSource(novel.sourceId);
  const content = await source.getChapterContent(
    toMeta(novel.id, novel.sourceId, chapter),
  );
  const path = await saveChapterContent(novel.id, chapter.id, content);
  await chaptersDb.setChapterContentPath(chapter.id, path);
}

export async function removeChapterDownload(chapterId: string): Promise<void> {
  const chapter = await chaptersDb.getChapter(chapterId);
  if (chapter?.contentPath) {
    await deleteChapterFile(chapter.contentPath);
    await chaptersDb.setChapterContentPath(chapterId, null);
  }
}

/** Download every not-yet-downloaded chapter for a novel. */
export async function downloadNovel(
  novelId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadProgress> {
  const chapters = await chaptersDb.getChapters(novelId);
  return downloadChapters(novelId, chapters, onProgress);
}

/**
 * Download a specific set of chapters (already-downloaded ones are skipped).
 * Powers the custom-download options on the novel screen — a range, the
 * unread tail, and so on all resolve to a list of chapters passed here.
 */
export async function downloadChapters(
  novelId: string,
  chapters: ChapterRecord[],
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadProgress> {
  const novel = await novelsDb.getNovel(novelId);
  if (!novel) throw new Error('Novel not found');
  const source = getSource(novel.sourceId);

  const pending = chapters.filter((c) => !c.contentPath);
  const progress: DownloadProgress = {
    total: pending.length,
    completed: 0,
    failed: 0,
  };

  const token = { cancelled: false };
  inFlight.set(novelId, token);
  onProgress?.(progress);

  try {
    for (const chapter of pending) {
      if (token.cancelled) break;
      progress.currentTitle = chapter.title;
      try {
        const content = await source.getChapterContent(
          toMeta(novelId, novel.sourceId, chapter),
        );
        const path = await saveChapterContent(novelId, chapter.id, content);
        await chaptersDb.setChapterContentPath(chapter.id, path);
        progress.completed += 1;
      } catch {
        progress.failed += 1;
      }
      onProgress?.({ ...progress });
      // Be polite to the source between requests.
      await delay(350);
    }
  } finally {
    inFlight.delete(novelId);
  }
  return progress;
}

export function cancelDownload(novelId: string): void {
  const token = inFlight.get(novelId);
  if (token) token.cancelled = true;
}

export function isDownloading(novelId: string): boolean {
  return inFlight.has(novelId);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
