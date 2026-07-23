/**
 * SQLite connection + schema. All library data lives on-device in SQLite;
 * downloaded chapter text lives on the filesystem (see storage/files.ts).
 */
import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

async function init(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('offlinenovel.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS novels (
      id             TEXT PRIMARY KEY,
      source_id      TEXT NOT NULL,
      url            TEXT NOT NULL,
      title          TEXT NOT NULL,
      author         TEXT,
      description    TEXT,
      status         TEXT,
      genres         TEXT,            -- JSON array
      cover_url      TEXT,
      cover_path     TEXT,            -- local file path once downloaded
      in_library     INTEGER NOT NULL DEFAULT 0,
      chapter_count  INTEGER NOT NULL DEFAULT 0,
      last_checked   INTEGER,         -- epoch ms of last update check
      has_updates    INTEGER NOT NULL DEFAULT 0,
      added_at       INTEGER,
      updated_at     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id             TEXT PRIMARY KEY,
      novel_id       TEXT NOT NULL,
      url            TEXT NOT NULL,
      title          TEXT NOT NULL,
      order_index    INTEGER NOT NULL,
      published_label TEXT,
      content_path   TEXT,            -- local file path if downloaded, else NULL
      downloaded_at  INTEGER,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chapters_novel ON chapters(novel_id, order_index);

    CREATE TABLE IF NOT EXISTS progress (
      novel_id       TEXT PRIMARY KEY,
      chapter_id     TEXT NOT NULL,
      chapter_order  INTEGER NOT NULL,
      scroll_offset  REAL NOT NULL DEFAULT 0,
      updated_at     INTEGER NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key            TEXT PRIMARY KEY,
      value          TEXT NOT NULL
    );
  `);
}
