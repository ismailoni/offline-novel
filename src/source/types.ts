/**
 * Source abstraction. A "source" is a website adapter that knows how to
 * search, list, and fetch novels/chapters from a given site.
 *
 * Keeping this an interface means novelphoenix.com is just one implementation;
 * adding another site later only requires a new adapter, not app changes.
 */

export interface NovelSummary {
  /** Stable id: `${sourceId}:${slug}` */
  id: string;
  sourceId: string;
  /** Absolute URL of the novel's detail page. */
  url: string;
  title: string;
  coverUrl?: string;
  /** Optional short hint shown in lists (e.g. "Ch. 1203" or "Ongoing"). */
  subtitle?: string;
}

export interface NovelDetail extends NovelSummary {
  author?: string;
  description?: string;
  status?: string;
  genres: string[];
  /** Chapter count as reported by the source at fetch time. */
  chapterCount: number;
}

export interface ChapterMeta {
  /** Stable id: `${novelId}:${slug}` */
  id: string;
  novelId: string;
  url: string;
  title: string;
  /** 1-based reading order (1 = first/oldest chapter). */
  order: number;
  publishedLabel?: string;
}

export interface ChapterContent {
  /** Ordered paragraphs of plain text, ready to render. */
  paragraphs: string[];
  /** Optional raw HTML kept for debugging / re-parsing. */
  html?: string;
}

export interface PagedResult<T> {
  items: T[];
  hasMore: boolean;
  nextPage?: number;
}

export interface GetChaptersOptions {
  /**
   * Invoked after each page of chapters is fetched with the full accumulated
   * (de-duped, ordered) list so far. Lets the caller persist progressively so a
   * mid-crawl failure keeps what already succeeded instead of losing everything.
   */
  onProgress?: (chapters: ChapterMeta[]) => void | Promise<void>;
}

export interface NovelSource {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;

  getLatest(page: number): Promise<PagedResult<NovelSummary>>;
  search(query: string, page: number): Promise<PagedResult<NovelSummary>>;
  getNovel(url: string): Promise<NovelDetail>;
  /** Full chapter list, ordered oldest -> newest. */
  getChapters(novel: NovelDetail, opts?: GetChaptersOptions): Promise<ChapterMeta[]>;
  getChapterContent(chapter: ChapterMeta): Promise<ChapterContent>;
}
