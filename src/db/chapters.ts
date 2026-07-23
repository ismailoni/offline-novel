import { getDb } from './database';
import { ChapterRecord } from './types';
import { ChapterMeta } from '@/source/types';

interface ChapterRow {
  id: string;
  novel_id: string;
  url: string;
  title: string;
  order_index: number;
  published_label: string | null;
  content_path: string | null;
  downloaded_at: number | null;
}

function hydrate(r: ChapterRow): ChapterRecord {
  return {
    id: r.id,
    novelId: r.novel_id,
    url: r.url,
    title: r.title,
    orderIndex: r.order_index,
    publishedLabel: r.published_label ?? undefined,
    contentPath: r.content_path ?? undefined,
    downloadedAt: r.downloaded_at ?? undefined,
  };
}

/**
 * Replace the chapter list for a novel while preserving any already-downloaded
 * content paths (matched by chapter id), so re-syncing never loses downloads.
 */
export async function syncChapters(
  novelId: string,
  chapters: ChapterMeta[],
): Promise<void> {
  const db = await getDb();
  const existing = await db.getAllAsync<{ id: string; content_path: string | null; downloaded_at: number | null }>(
    'SELECT id, content_path, downloaded_at FROM chapters WHERE novel_id = ?',
    [novelId],
  );
  const keep = new Map(existing.map((e) => [e.id, e]));

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM chapters WHERE novel_id = ?', [novelId]);
    for (const c of chapters) {
      const prev = keep.get(c.id);
      await db.runAsync(
        `INSERT INTO chapters
           (id, novel_id, url, title, order_index, published_label, content_path, downloaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id,
          novelId,
          c.url,
          c.title,
          c.order,
          c.publishedLabel ?? null,
          prev?.content_path ?? null,
          prev?.downloaded_at ?? null,
        ],
      );
    }
  });
}

export async function getChapters(novelId: string): Promise<ChapterRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ChapterRow>(
    'SELECT * FROM chapters WHERE novel_id = ? ORDER BY order_index ASC',
    [novelId],
  );
  return rows.map(hydrate);
}

export async function getChapter(id: string): Promise<ChapterRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ChapterRow>('SELECT * FROM chapters WHERE id = ?', [id]);
  return row ? hydrate(row) : null;
}

export async function setChapterContentPath(id: string, path: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE chapters SET content_path = ?, downloaded_at = ? WHERE id = ?',
    [path, path ? Date.now() : null, id],
  );
}

export async function countChapters(novelId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM chapters WHERE novel_id = ?',
    [novelId],
  );
  return row?.n ?? 0;
}

export async function countDownloaded(novelId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM chapters WHERE novel_id = ? AND content_path IS NOT NULL',
    [novelId],
  );
  return row?.n ?? 0;
}
