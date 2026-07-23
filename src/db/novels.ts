import { getDb } from './database';
import { NovelRecord } from './types';
import { NovelDetail, NovelSummary } from '@/source/types';

interface NovelRow {
  id: string;
  source_id: string;
  url: string;
  title: string;
  author: string | null;
  description: string | null;
  status: string | null;
  genres: string | null;
  cover_url: string | null;
  cover_path: string | null;
  in_library: number;
  chapter_count: number;
  last_checked: number | null;
  has_updates: number;
  added_at: number | null;
  updated_at: number;
}

function hydrate(r: NovelRow): NovelRecord {
  return {
    id: r.id,
    sourceId: r.source_id,
    url: r.url,
    title: r.title,
    author: r.author ?? undefined,
    description: r.description ?? undefined,
    status: r.status ?? undefined,
    genres: r.genres ? (JSON.parse(r.genres) as string[]) : [],
    coverUrl: r.cover_url ?? undefined,
    coverPath: r.cover_path ?? undefined,
    inLibrary: r.in_library === 1,
    chapterCount: r.chapter_count,
    lastChecked: r.last_checked ?? undefined,
    hasUpdates: r.has_updates === 1,
    addedAt: r.added_at ?? undefined,
    updatedAt: r.updated_at,
  };
}

/** Insert or refresh a novel's metadata without disturbing library flags. */
export async function upsertNovel(
  n: NovelSummary | NovelDetail,
): Promise<void> {
  const db = await getDb();
  const detail = n as Partial<NovelDetail>;
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO novels
       (id, source_id, url, title, author, description, status, genres, cover_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       url=excluded.url,
       title=excluded.title,
       author=COALESCE(excluded.author, novels.author),
       description=COALESCE(excluded.description, novels.description),
       status=COALESCE(excluded.status, novels.status),
       genres=COALESCE(excluded.genres, novels.genres),
       cover_url=COALESCE(excluded.cover_url, novels.cover_url),
       updated_at=excluded.updated_at`,
    [
      n.id,
      n.sourceId,
      n.url,
      n.title,
      detail.author ?? null,
      detail.description ?? null,
      detail.status ?? null,
      detail.genres ? JSON.stringify(detail.genres) : null,
      n.coverUrl ?? null,
      now,
    ],
  );
}

export async function getNovel(id: string): Promise<NovelRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<NovelRow>('SELECT * FROM novels WHERE id = ?', [id]);
  return row ? hydrate(row) : null;
}

export async function getLibrary(): Promise<NovelRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<NovelRow>(
    'SELECT * FROM novels WHERE in_library = 1 ORDER BY has_updates DESC, updated_at DESC',
  );
  return rows.map(hydrate);
}

export interface LibraryEntry extends NovelRecord {
  /** How far the reader has progressed, 0..1 (0 = not started). */
  readFraction: number;
}

/** Library novels annotated with reading progress for at-a-glance display. */
export async function getLibraryWithProgress(): Promise<LibraryEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<NovelRow & { read_order: number | null }>(
    `SELECT novels.*, progress.chapter_order AS read_order
       FROM novels
       LEFT JOIN progress ON progress.novel_id = novels.id
      WHERE in_library = 1
      ORDER BY has_updates DESC, updated_at DESC`,
  );
  return rows.map((r) => {
    const base = hydrate(r);
    const readOrder = r.read_order ?? 0;
    const readFraction =
      base.chapterCount > 0 ? Math.min(1, readOrder / base.chapterCount) : 0;
    return { ...base, readFraction };
  });
}

export async function setInLibrary(id: string, inLibrary: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE novels SET in_library = ?, added_at = COALESCE(added_at, ?), updated_at = ? WHERE id = ?',
    [inLibrary ? 1 : 0, Date.now(), Date.now(), id],
  );
}

export async function setCoverPath(id: string, path: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE novels SET cover_path = ? WHERE id = ?', [path, id]);
}

export async function setChapterCount(id: string, count: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE novels SET chapter_count = ?, updated_at = ? WHERE id = ?',
    [count, Date.now(), id],
  );
}

export async function markChecked(
  id: string,
  hasUpdates: boolean,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE novels SET last_checked = ?, has_updates = ? WHERE id = ?',
    [Date.now(), hasUpdates ? 1 : 0, id],
  );
}

export async function clearUpdateFlag(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE novels SET has_updates = 0 WHERE id = ?', [id]);
}

export async function deleteNovel(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM novels WHERE id = ?', [id]);
}
