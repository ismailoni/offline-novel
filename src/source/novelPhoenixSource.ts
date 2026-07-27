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
};

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

  async getChapters(novel: NovelDetail): Promise<ChapterMeta[]> {
    // Plain server-rendered, paginated HTML — no AJAX fragment/admin-ajax
    // involved here, unlike Madara.
    //
    // We do NOT trust the numeric pagination widget to decide when to stop.
    // On long novels its rendered page-number window truncates (e.g.
    // `1 … 9 10 11 … 25`), so probing for `page+1` as a literal `.page-item`
    // falsely reported "no next page" partway through and silently dropped
    // the tail — a 2500-chapter novel stopped at ~1100. Instead we walk pages
    // until one yields no *new* chapters (empty, or an out-of-range page that
    // the site clamps back to the last page), deduping by id along the way.
    const chapters: ChapterMeta[] = [];
    const seen = new Set<string>();
    const base = novel.url.replace(/\/+$/, '');
    const MAX_PAGES = 2000; // hard safety cap against a pathological loop
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${base}/chapters` + (page > 1 ? `?page=${page}` : '');
      const html = await fetchText(url, { referer: novel.url });
      const root = parseHtml(html);
      const rows = root.querySelectorAll(SEL.chapterItem);
      if (rows.length === 0) break;

      let added = 0;
      for (const row of rows) {
        const link = row.querySelector(SEL.chapterLink);
        const href = attr(link, 'href');
        if (!href) continue;
        const chUrl = absoluteUrl(BASE_URL, href);
        const id = `${novel.id}:${this.slugOf(chUrl)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        chapters.push({
          id,
          novelId: novel.id,
          url: chUrl,
          title: text(row.querySelector(SEL.chapterTitle)) || text(link) || 'Chapter',
          order: 0,
          publishedLabel:
            attr(row.querySelector(SEL.chapterDate), 'datetime') ||
            text(row.querySelector(SEL.chapterDate)) ||
            undefined,
        });
        added++;
      }

      // No new chapters on this page → we've reached (or passed) the end.
      if (added === 0) break;
    }

    // Already oldest-first on this site (chapter-no ascends 1..100 on page 1)
    // — no reverse() needed, unlike Madara's newest-first listings.
    chapters.forEach((c, i) => (c.order = i + 1));
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
