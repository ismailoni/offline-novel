/**
 * Library orchestration: adding/removing novels, syncing chapter lists, and
 * hydrating detail views. Sits between the UI and the db/source layers.
 */
import { getSource } from '@/source/registry';
import { ChapterMeta, NovelDetail } from '@/source/types';
import * as novelsDb from '@/db/novels';
import * as chaptersDb from '@/db/chapters';
import { downloadCover, deleteNovelFiles } from '@/storage/files';
import { NovelRecord } from '@/db/types';

export interface LoadNovelResult {
  novel: NovelRecord;
  chapterCount: number;
  /**
   * False when the source could not crawl the whole chapter list (e.g. 429
   * retries were exhausted mid-way). The chapters that did load are still
   * persisted, but the caller should surface the list as incomplete rather
   * than presenting the partial set as the finished thing.
   */
  complete: boolean;
}

/** Fetch a novel + its chapters from the source and persist everything. */
export async function loadAndCacheNovel(
  sourceId: string,
  url: string,
): Promise<LoadNovelResult> {
  const source = getSource(sourceId);
  const detail: NovelDetail = await source.getNovel(url);
  await novelsDb.upsertNovel(detail);

  // Persist chapters page-by-page as they arrive, additively — a merge never
  // deletes rows, so an interrupted crawl (e.g. a Cloudflare 429 that outlasts
  // our retries) keeps what already succeeded AND cannot shrink a previously
  // complete list back down to the partial set it managed to re-fetch.
  const persistPartial = (chapters: ChapterMeta[]) =>
    chaptersDb.mergeChapters(detail.id, chapters);

  const { chapters, complete } = await source.getChapters(detail, {
    onProgress: persistPartial,
  });

  if (complete) {
    // Authoritative replace: prunes chapters the source has genuinely removed
    // and pins the count to the fully-crawled list.
    await chaptersDb.syncChapters(detail.id, chapters);
    await novelsDb.setChapterCount(detail.id, chapters.length);
  } else {
    // Partial crawl: merge (never shrink) and never lower the reported count
    // below what we already had stored.
    await persistPartial(chapters);
    const stored = await chaptersDb.countChapters(detail.id);
    await novelsDb.setChapterCount(detail.id, stored);
  }

  const finalCount = await chaptersDb.countChapters(detail.id);
  const novel = await novelsDb.getNovel(detail.id);
  return { novel: novel!, chapterCount: finalCount, complete };
}

export async function addToLibrary(novelId: string): Promise<void> {
  await novelsDb.setInLibrary(novelId, true);
  const novel = await novelsDb.getNovel(novelId);
  if (novel?.coverUrl && !novel.coverPath) {
    const path = await downloadCover(novelId, novel.coverUrl);
    if (path) await novelsDb.setCoverPath(novelId, path);
  }
}

export async function removeFromLibrary(
  novelId: string,
  purgeDownloads: boolean,
): Promise<void> {
  await novelsDb.setInLibrary(novelId, false);
  if (purgeDownloads) {
    await deleteNovelFiles(novelId);
    for (const ch of await chaptersDb.getChapters(novelId)) {
      if (ch.contentPath) await chaptersDb.setChapterContentPath(ch.id, null);
    }
  }
}

export async function getLibrary(): Promise<NovelRecord[]> {
  return novelsDb.getLibrary();
}
