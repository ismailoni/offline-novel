import { getDb } from './database';
import { ProgressRecord } from './types';

interface ProgressRow {
  novel_id: string;
  chapter_id: string;
  chapter_order: number;
  scroll_offset: number;
  updated_at: number;
}

export async function saveProgress(p: {
  novelId: string;
  chapterId: string;
  chapterOrder: number;
  scrollOffset: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO progress (novel_id, chapter_id, chapter_order, scroll_offset, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(novel_id) DO UPDATE SET
       chapter_id=excluded.chapter_id,
       chapter_order=excluded.chapter_order,
       scroll_offset=excluded.scroll_offset,
       updated_at=excluded.updated_at`,
    [p.novelId, p.chapterId, p.chapterOrder, p.scrollOffset, Date.now()],
  );
  // Keep the library sort fresh: a novel you're actively reading floats up.
  await db.runAsync('UPDATE novels SET updated_at = ? WHERE id = ?', [
    Date.now(),
    p.novelId,
  ]);
}

export async function getProgress(novelId: string): Promise<ProgressRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProgressRow>(
    'SELECT * FROM progress WHERE novel_id = ?',
    [novelId],
  );
  if (!row) return null;
  return {
    novelId: row.novel_id,
    chapterId: row.chapter_id,
    chapterOrder: row.chapter_order,
    scrollOffset: row.scroll_offset,
    updatedAt: row.updated_at,
  };
}
