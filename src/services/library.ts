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

/** Fetch a novel + its chapters from the source and persist everything. */
export async function loadAndCacheNovel(
  sourceId: string,
  url: string,
): Promise<{ novel: NovelRecord; chapterCount: number }> {
  const source = getSource(sourceId);
  const detail: NovelDetail = await source.getNovel(url);
  await novelsDb.upsertNovel(detail);

  // Persist chapters page-by-page as they arrive. If the crawl is interrupted
  // mid-way (e.g. a Cloudflare 429 that outlasts our retries), whatever pages
  // already succeeded stay saved and the import can resume on the next open,
  // instead of collapsing the whole novel back to 0 chapters.
  let persistedCount = 0;
  const persist = async (chapters: ChapterMeta[]) => {
    await chaptersDb.syncChapters(detail.id, chapters);
    await novelsDb.setChapterCount(detail.id, chapters.length);
    persistedCount = chapters.length;
  };

  const chapters = await source.getChapters(detail, {
    onProgress: (chs) => persist(chs),
  });
  await persist(chapters);

  const novel = await novelsDb.getNovel(detail.id);
  return { novel: novel!, chapterCount: persistedCount };
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
