/**
 * Update checking. For each library novel we re-fetch its chapter list and
 * compare the count to what we have stored; more chapters => an update.
 * Used both by pull-to-refresh and the background task.
 */
import { getSource } from '@/source/registry';
import * as novelsDb from '@/db/novels';
import * as chaptersDb from '@/db/chapters';

export interface UpdateResult {
  novelId: string;
  title: string;
  previousCount: number;
  newCount: number;
  newChapters: number;
}

/** Check a single novel. Returns a result only if new chapters were found. */
export async function checkNovel(novelId: string): Promise<UpdateResult | null> {
  const novel = await novelsDb.getNovel(novelId);
  if (!novel) return null;

  const source = getSource(novel.sourceId);
  const previousCount = await chaptersDb.countChapters(novelId);

  const detail = await source.getNovel(novel.url);
  const { chapters, complete } = await source.getChapters(detail);

  if (complete) {
    // Only a fully-crawled list is authoritative enough to replace what we have.
    await chaptersDb.syncChapters(novelId, chapters);
    await novelsDb.setChapterCount(novelId, chapters.length);
  } else {
    // An interrupted crawl must not truncate a good stored list: merge what we
    // got (additively) and keep the count at whatever we actually hold.
    await chaptersDb.mergeChapters(novelId, chapters);
    await novelsDb.setChapterCount(novelId, await chaptersDb.countChapters(novelId));
  }

  const newCount = await chaptersDb.countChapters(novelId);
  const newChapters = newCount - previousCount;
  const hasUpdates = newChapters > 0;
  await novelsDb.markChecked(novelId, hasUpdates || novel.hasUpdates);

  if (!hasUpdates) return null;
  return {
    novelId,
    title: novel.title,
    previousCount,
    newCount,
    newChapters,
  };
}

/** Check the entire library, sequentially and politely. Returns all updates. */
export async function checkLibrary(
  onEach?: (novelTitle: string) => void,
): Promise<UpdateResult[]> {
  const library = await novelsDb.getLibrary();
  const results: UpdateResult[] = [];
  for (const novel of library) {
    onEach?.(novel.title);
    try {
      const result = await checkNovel(novel.id);
      if (result) results.push(result);
    } catch {
      // Network hiccups shouldn't abort the whole sweep.
    }
    await delay(500);
  }
  return results;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
