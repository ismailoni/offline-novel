/** Row shapes as stored in SQLite, plus their hydrated app-facing forms. */

export interface NovelRecord {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  author?: string;
  description?: string;
  status?: string;
  genres: string[];
  coverUrl?: string;
  coverPath?: string;
  inLibrary: boolean;
  chapterCount: number;
  lastChecked?: number;
  hasUpdates: boolean;
  addedAt?: number;
  updatedAt: number;
}

export interface ChapterRecord {
  id: string;
  novelId: string;
  url: string;
  title: string;
  orderIndex: number;
  publishedLabel?: string;
  contentPath?: string;
  downloadedAt?: number;
}

export interface ProgressRecord {
  novelId: string;
  chapterId: string;
  chapterOrder: number;
  scrollOffset: number;
  updatedAt: number;
}
