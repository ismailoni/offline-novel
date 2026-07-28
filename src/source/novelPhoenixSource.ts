/**
 * Adapter for novelphoenix.com specifically.
 *
 * NOTE: novelphoenix.com does NOT run WordPress/Madara — confirmed by
 * inspecting the live DOM (no wp-content assets, no generator meta, no
 * wp-manga classes anywhere). It's a custom-built reader front-end, so this
 * adapter targets its actual markup rather than reusing MadaraSource/Config.
 */
import {
  ChapterContent,
  ChapterMeta,
  GetChaptersOptions,
  NovelDetail,
  NovelSource,
  NovelSummary,
  PagedResult,
} from './types';
import { absoluteUrl, fetchText } from './http';
import { attr, extractParagraphs, imageUrl, parseHtml, text } from './parse';
import { HTMLElement } from 'node-html-parser';

const BASE_URL = 'https://novelphoenix.com';

const SEL = {
  novelItem: '.novel-item',
  novelItemTitle: '.novel-title',
  novelItemImage: '.novel-cover img',

  detailTitle: 'h1.novel-title',
  detailImage: '.cover img',
  detailAuthor: '.author a.property-item',
  detailGenre: '.categories ul a',
  // The status word is the *class name* of this element (ongoing/completed/
  // hiatus); the visible "Status" text is a separate sibling <small>.
  detailStatus: '.header-stats strong',
  detailDescription: '.summary',

  chapterItem: '.chapter-list > li',
  chapterLink: 'a',
  chapterTitle: '.chapter-title',
  chapterDate: '.chapter-update', // has a real `datetime` attribute

  chapterContent: '.d-chapter-content',

  // Pagination widget on the /chapters page. It renders a windowed list of
  // page-number links plus a trailing `Next »` control; on long novels the
  // window inserts `...` ellipsis <li> nodes that carry NO <a href>.
  pager: '.pagination a, ul.pagination a, .paging a',
};

/** How many chapters the source packs onto one /chapters page. */
const CHAPTERS_PER_PAGE = 100;

/** Polite delay between page requests so we don't trip Cloudflare's limiter. */
const PAGE_DELAY_MS = 400;

/** Hard safety cap against a pathological pagination loop. */
const MAX_PAGES = 5000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class NovelPhoenixSource implements NovelSource {
  readonly id = 'novelphoenix';
  readonly name = 'Novel Phoenix';
  readonly baseUrl = BASE_URL;

  async getLatest(page: number): Promise<PagedResult<NovelSummary>> {
    const url =
      `${BASE_URL}/genre-all/sort-new/status-all/all-novel` +
      (page > 1 ? `?page=${page}` : '');
    const html = await fetchText(url, { referer: BASE_URL });
    return this.parseListing(html, page);
  }

  async search(query: string, page: number): Promise<PagedResult<NovelSummary>> {
    const q = encodeURIComponent(query);
    const url =
      `${BASE_URL}/search?keyword=${q}&type=title` + (page > 1 ? `&page=${page}` : '');
    const html = await fetchText(url, { referer: BASE_URL });
    return this.parseListing(html, page);
  }

  private parseListing(html: string, page: number): PagedResult<NovelSummary> {
    const root = parseHtml(html);
    const items: NovelSummary[] = [];
    for (const item of root.querySelectorAll(SEL.novelItem)) {
      const link = item.querySelector('a');
      const href = attr(link, 'href');
      const title = text(item.querySelector(SEL.novelItemTitle)) || text(link);
      if (!href || !title) continue;
      const img = item.querySelector(SEL.novelItemImage) ?? item.querySelector('img');
      const url = absoluteUrl(BASE_URL, href);
      items.push({
        id: this.novelId(url),
        sourceId: this.id,
        url,
        title,
        coverUrl: this.absImg(img),
      });
    }
    const seen = new Set<string>();
    const deduped = items.filter((n) => (seen.has(n.id) ? false : seen.add(n.id)));
    const hasMore = deduped.length > 0;
    return { items: deduped, hasMore, nextPage: hasMore ? page + 1 : undefined };
  }

  async getNovel(url: string): Promise<NovelDetail> {
    const html = await fetchText(url, { referer: BASE_URL });
    const root = parseHtml(html);

    const title = text(root.querySelector(SEL.detailTitle));
    const coverUrl = this.absImg(root.querySelector(SEL.detailImage));
    const author = text(root.querySelector(SEL.detailAuthor)) || undefined;
    const genres = root
      .querySelectorAll(SEL.detailGenre)
      .map((g) => text(g))
      .filter(Boolean);

    const statusEl = root.querySelector(SEL.detailStatus);
    const status = statusEl ? text(statusEl) || undefined : undefined;

    const description = text(root.querySelector(SEL.detailDescription)) || undefined;

    return {
      id: this.novelId(url),
      sourceId: this.id,
      url,
      title: title || 'Unknown title',
      coverUrl,
      author,
      description,
      status,
      genres,
      chapterCount: 0,
    };
  }

  async getChapters(
    novel: NovelDetail,
    opts: GetChaptersOptions = {},
  ): Promise<ChapterMeta[]> {
    // Plain server-rendered, paginated HTML — no AJAX fragment/admin-ajax
    // involved here, unlike Madara. The source packs 100 chapters per page at
    // `/chapters?page=N`.
    //
    // We do NOT infer the stop point from the numeric pagination widget's
    // layout. On long novels its rendered window inserts `...` ellipsis <li>
    // nodes with no <a href> (first appearing around page 11), so any logic
    // keyed off list position — "last <li>", "next sibling" — tripped over the
    // empty nodes and stopped at page 11, dropping the tail (a 2555-chapter
    // novel stopped at ~1100). Instead we:
    //   1. Compute the true last page from the total-chapters count (or, failing
    //      that, the highest numbered page link) and loop 1..lastPage.
    //   2. Fall back to an explicit `Next »` link probe (an anchor that must
    //      have a real href — ellipsis nodes are filtered out) when the total
    //      can't be read.
    //   3. De-dupe by chapter number so a repeated/clamped page can't silently
    //      end the crawl, and a failed page doesn't corrupt the result.
    const base = novel.url.replace(/\/+$/, '');
    const pageUrl = (p: number) =>
      `${base}/chapters` + (p > 1 ? `?page=${p}` : '');

    const chapters: ChapterMeta[] = [];
    const seenIds = new Set<string>();
    const seenNumbers = new Set<number>();

    const ingest = (root: HTMLElement): number => {
      const rows = root.querySelectorAll(SEL.chapterItem);
      let added = 0;
      for (const row of rows) {
        const link = row.querySelector(SEL.chapterLink);
        const href = attr(link, 'href');
        if (!href) continue;
        const chUrl = absoluteUrl(BASE_URL, href);
        const id = `${novel.id}:${this.slugOf(chUrl)}`;
        const title =
          text(row.querySelector(SEL.chapterTitle)) || text(link) || 'Chapter';
        const num = this.chapterNumber(title, chUrl);
        if (seenIds.has(id)) continue;
        if (num != null && seenNumbers.has(num)) continue;
        seenIds.add(id);
        if (num != null) seenNumbers.add(num);
        chapters.push({
          id,
          novelId: novel.id,
          url: chUrl,
          title,
          order: 0,
          publishedLabel:
            attr(row.querySelector(SEL.chapterDate), 'datetime') ||
            text(row.querySelector(SEL.chapterDate)) ||
            undefined,
        });
        added++;
      }
      return added;
    };

    // Assign 1-based reading order over the accumulated list. The site lists
    // oldest-first (chapter-no ascends 1..100 on page 1), so insertion order is
    // already correct — no reverse() needed, unlike Madara's newest-first pages.
    const finalize = () => chapters.forEach((c, i) => (c.order = i + 1));
    const emit = async () => {
      finalize();
      await opts.onProgress?.(chapters.slice());
    };

    // Page 1 is required — if it can't be fetched there's nothing to salvage.
    const firstRoot = parseHtml(await fetchText(pageUrl(1), { referer: novel.url }));
    ingest(firstRoot);
    const lastPage = this.detectLastPage(firstRoot);
    let hasNext = this.hasNextPage(firstRoot);
    await emit();

    for (let page = 2; page <= MAX_PAGES; page++) {
      if (lastPage != null) {
        if (page > lastPage) break;
      } else if (!hasNext) {
        break;
      }

      await delay(PAGE_DELAY_MS);

      let root: HTMLElement;
      try {
        root = parseHtml(await fetchText(pageUrl(page), { referer: novel.url }));
      } catch {
        // fetchText already retried rate-limits/challenges with backoff. If it
        // still failed, keep everything gathered so far (already persisted via
        // onProgress) rather than discarding the whole import.
        break;
      }

      const added = ingest(root);
      hasNext = this.hasNextPage(root);

      // An out-of-range page the site clamps back to the last page yields no
      // new chapters — stop once we know there's no more real content.
      if (added === 0) break;

      await emit();
    }

    finalize();
    return chapters;
  }

  async getChapterContent(chapter: ChapterMeta): Promise<ChapterContent> {
    const html = await fetchText(chapter.url, { referer: BASE_URL });
    const root = parseHtml(html);
    const container = root.querySelector(SEL.chapterContent) ?? root;
    const paragraphs = extractParagraphs(container);
    return { paragraphs };
  }

  // ---- helpers ----

  /**
   * Work out the true last page of the chapter list without relying on the
   * pager's rendered layout. Preferred signal is the "A total of N chapters
   * have been translated" line; failing that, the highest numbered page link.
   * Returns undefined when neither is present (caller then walks via Next »).
   */
  private detectLastPage(root: HTMLElement): number | undefined {
    const total = this.totalChapterCount(root);
    if (total != null && total > 0) {
      return Math.max(1, Math.ceil(total / CHAPTERS_PER_PAGE));
    }

    let maxPage = 0;
    for (const a of root.querySelectorAll(SEL.pager)) {
      const href = attr(a, 'href');
      if (!href) continue; // skip the `...` ellipsis / bare <li> nodes
      const m = href.match(/[?&]page=(\d+)/);
      if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
    }
    return maxPage > 0 ? maxPage : undefined;
  }

  /** Parse the "A total of N chapters have been translated" figure, if shown. */
  private totalChapterCount(root: HTMLElement): number | undefined {
    const body = text(root);
    const m = body.match(/total of\s+([\d,]+)\s+chapters?/i);
    if (!m) return undefined;
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : undefined;
  }

  /**
   * Is there a *real* next page? We target the `Next »` control explicitly by
   * its label rather than list position, and only count it when it carries an
   * actual href. On the last page the source renders `Next »` as a bare node
   * with no anchor — that (and only that) is the stop signal. Ellipsis `...`
   * nodes have no href and are ignored here.
   */
  private hasNextPage(root: HTMLElement): boolean {
    for (const a of root.querySelectorAll(SEL.pager)) {
      const href = attr(a, 'href');
      if (!href) continue;
      const rel = (attr(a, 'rel') || '').toLowerCase();
      const label = text(a).toLowerCase();
      const aria = (attr(a, 'aria-label') || '').toLowerCase();
      if (
        rel.includes('next') ||
        aria.includes('next') ||
        /next|»|›/.test(label)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extract a chapter's numeric position from its title ("Chapter 1203") or,
   * failing that, a trailing number in its URL slug (…-chapter-1203). Used to
   * de-dupe across pages. Returns undefined when no number is present.
   */
  private chapterNumber(title: string, url: string): number | undefined {
    const fromTitle = title.match(/chapter\s*#?\s*(\d+(?:\.\d+)?)/i);
    if (fromTitle) return parseFloat(fromTitle[1]);
    const slug = this.slugOf(url);
    const fromSlug = slug.match(/(?:^|[^\d])(\d+(?:\.\d+)?)(?!.*\d)/);
    if (fromSlug) return parseFloat(fromSlug[1]);
    return undefined;
  }

  private slugOf(url: string): string {
    const clean = url.split('?')[0].replace(/\/+$/, '');
    const parts = clean.split('/');
    return parts[parts.length - 1] || clean;
  }

  private novelId(url: string): string {
    return `${this.id}:${this.slugOf(url)}`;
  }

  private absImg(el: HTMLElement | null | undefined): string | undefined {
    const raw = imageUrl(el);
    return raw ? absoluteUrl(BASE_URL, raw) : undefined;
  }
}
