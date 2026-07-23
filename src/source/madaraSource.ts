/**
 * Adapter for WordPress + "Madara" theme sites, which is what novelphoenix.com
 * (and the large majority of free light-novel readers) run on.
 *
 * IMPORTANT — tuning selectors:
 * Everything site-specific lives in `MadaraConfig` below. This sandbox cannot
 * reach novelphoenix.com to verify the live DOM, so these are the Madara
 * defaults. If a screen shows empty results on-device, open the site in a
 * browser, inspect the element, and adjust the matching selector here — no
 * other code needs to change.
 */
import {
  ChapterContent,
  ChapterMeta,
  NovelDetail,
  NovelSource,
  NovelSummary,
  PagedResult,
} from './types';
import { absoluteUrl, fetchText, formEncode } from './http';
import { attr, extractParagraphs, imageUrl, parseHtml, text } from './parse';
import { HTMLElement } from 'node-html-parser';

export interface MadaraConfig {
  id: string;
  name: string;
  baseUrl: string;
  /** Path segment used for novels, e.g. "novel" -> /novel/{slug}/ */
  novelPath: string;
  selectors: {
    // Listing / search cards
    novelItem: string;
    novelItemTitle: string;
    novelItemLink: string;
    novelItemImage: string;
    // Detail page
    detailTitle: string;
    detailImage: string;
    detailAuthor: string;
    detailGenre: string;
    detailStatusRow: string;
    detailDescription: string;
    // Chapter list (from the ajax fragment)
    chapterItem: string;
    chapterLink: string;
    chapterDate: string;
    // Reader
    chapterContent: string;
  };
}

export const NOVELPHOENIX_CONFIG: MadaraConfig = {
  id: 'novelphoenix',
  name: 'Novel Phoenix',
  baseUrl: 'https://novelphoenix.com',
  novelPath: 'novel',
  selectors: {
    novelItem: '.page-item-detail, .c-tabs-item__content, .manga',
    novelItemTitle: '.post-title h3 a, .post-title h5 a, .item-summary a, h3 a',
    novelItemLink: '.post-title h3 a, .post-title h5 a, .item-thumb a, h3 a',
    novelItemImage: 'img',
    detailTitle: '.post-title h1, .post-title h3, .post-title',
    detailImage: '.summary_image img, .tab-summary img',
    detailAuthor: '.author-content a, .manga-authors a',
    detailGenre: '.genres-content a, .genres a',
    detailStatusRow: '.post-content_item, .post-status .post-content_item',
    detailDescription:
      '.description-summary .summary__content, .summary_content .summary__content, .manga-excerpt, .summary__content',
    chapterItem: 'li.wp-manga-chapter',
    chapterLink: 'a',
    chapterDate: '.chapter-release-date, .chapter-release-date i',
    chapterContent: '.reading-content .text-left, .reading-content, .entry-content, .text-left',
  },
};

export class MadaraSource implements NovelSource {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;

  constructor(private cfg: MadaraConfig) {
    this.id = cfg.id;
    this.name = cfg.name;
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
  }

  async getLatest(page: number): Promise<PagedResult<NovelSummary>> {
    // Madara: /page/{n}/?s=&post_type=wp-manga&m_orderby=latest
    const url =
      `${this.baseUrl}/${this.cfg.novelPath}/` +
      (page > 1 ? `page/${page}/` : '') +
      `?m_orderby=latest`;
    const html = await fetchText(url, { referer: this.baseUrl });
    return this.parseListing(html, page);
  }

  async search(query: string, page: number): Promise<PagedResult<NovelSummary>> {
    const q = encodeURIComponent(query);
    const url =
      `${this.baseUrl}/` +
      (page > 1 ? `page/${page}/` : '') +
      `?s=${q}&post_type=wp-manga`;
    const html = await fetchText(url, { referer: this.baseUrl });
    return this.parseListing(html, page);
  }

  private parseListing(html: string, page: number): PagedResult<NovelSummary> {
    const root = parseHtml(html);
    const items: NovelSummary[] = [];
    for (const item of root.querySelectorAll(this.cfg.selectors.novelItem)) {
      const link = item.querySelector(this.cfg.selectors.novelItemLink);
      const href = attr(link, 'href');
      const title =
        text(item.querySelector(this.cfg.selectors.novelItemTitle)) || text(link);
      if (!href || !title) continue;
      const img = item.querySelector(this.cfg.selectors.novelItemImage);
      const url = absoluteUrl(this.baseUrl, href);
      items.push({
        id: this.novelId(url),
        sourceId: this.id,
        url,
        title,
        coverUrl: this.absImg(img),
      });
    }
    // Dedupe (Madara listings sometimes repeat the thumb + title link).
    const seen = new Set<string>();
    const deduped = items.filter((n) => (seen.has(n.id) ? false : seen.add(n.id)));
    const hasMore = deduped.length > 0;
    return { items: deduped, hasMore, nextPage: hasMore ? page + 1 : undefined };
  }

  async getNovel(url: string): Promise<NovelDetail> {
    const html = await fetchText(url, { referer: this.baseUrl });
    const root = parseHtml(html);
    const s = this.cfg.selectors;

    const title = text(root.querySelector(s.detailTitle));
    const coverUrl = this.absImg(root.querySelector(s.detailImage));
    const author = text(root.querySelector(s.detailAuthor)) || undefined;
    const genres = root
      .querySelectorAll(s.detailGenre)
      .map((g) => text(g))
      .filter(Boolean);

    let status: string | undefined;
    for (const row of root.querySelectorAll(s.detailStatusRow)) {
      if (/status/i.test(row.text)) {
        status = text(row).replace(/.*status\s*/i, '').trim() || undefined;
        break;
      }
    }

    const description =
      text(root.querySelector(s.detailDescription)) || undefined;

    const detail: NovelDetail = {
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
    // Chapter count is filled by getChapters(); many detail pages omit it.
    return detail;
  }

  async getChapters(novel: NovelDetail): Promise<ChapterMeta[]> {
    const html = await this.fetchChapterFragment(novel.url);
    const root = parseHtml(html);
    const s = this.cfg.selectors;

    const rows = root.querySelectorAll(s.chapterItem);
    const chapters: ChapterMeta[] = [];
    for (const row of rows) {
      const link = row.querySelector(s.chapterLink);
      const href = attr(link, 'href');
      if (!href) continue;
      const url = absoluteUrl(this.baseUrl, href);
      chapters.push({
        id: `${novel.id}:${this.slugOf(url)}`,
        novelId: novel.id,
        url,
        title: text(link) || 'Chapter',
        order: 0, // set after we know total + direction
        publishedLabel: text(row.querySelector(s.chapterDate)) || undefined,
      });
    }
    // Madara lists newest-first; reverse to oldest-first and assign order.
    chapters.reverse();
    chapters.forEach((c, i) => (c.order = i + 1));
    return chapters;
  }

  /**
   * Madara serves the chapter list via AJAX, not in the detail HTML.
   * Newer themes expose `{novelUrl}ajax/chapters/`; if that 404s, fall back to
   * admin-ajax.php with the numeric post id.
   */
  private async fetchChapterFragment(novelUrl: string): Promise<string> {
    const base = novelUrl.endsWith('/') ? novelUrl : novelUrl + '/';
    try {
      return await fetchText(`${base}ajax/chapters/`, {
        method: 'POST',
        referer: novelUrl,
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
    } catch {
      // Fallback path: fetch detail page, read post id, hit admin-ajax.
      const detailHtml = await fetchText(novelUrl, { referer: this.baseUrl });
      const postId = this.extractPostId(parseHtml(detailHtml));
      if (!postId) throw new Error('Could not locate chapter list');
      return fetchText(`${this.baseUrl}/wp-admin/admin-ajax.php`, {
        method: 'POST',
        referer: novelUrl,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: formEncode({ action: 'manga_get_chapters', manga: postId }),
      });
    }
  }

  private extractPostId(root: HTMLElement): string | undefined {
    const input = root.querySelector('.rating-post-id, #manga-chapters-holder');
    const id = attr(input, 'value') ?? attr(input, 'data-id');
    if (id) return id;
    const shortlink = attr(root.querySelector('link[rel="shortlink"]'), 'href');
    const m = shortlink?.match(/[?&]p=(\d+)/);
    return m?.[1];
  }

  async getChapterContent(chapter: ChapterMeta): Promise<ChapterContent> {
    const html = await fetchText(chapter.url, { referer: this.baseUrl });
    const root = parseHtml(html);
    const container =
      root.querySelector(this.cfg.selectors.chapterContent) ??
      root.querySelector('article') ??
      root;
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
    return raw ? absoluteUrl(this.baseUrl, raw) : undefined;
  }
}
