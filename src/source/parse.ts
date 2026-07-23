/**
 * Thin helpers over node-html-parser so adapters read cleanly.
 * node-html-parser is pure JS (no DOM), so it runs fine on Hermes/RN.
 */
import { parse, HTMLElement } from 'node-html-parser';

export function parseHtml(html: string): HTMLElement {
  return parse(html, {
    lowerCaseTagName: false,
    comment: false,
    blockTextElements: { script: false, noscript: false, style: false },
  });
}

export function text(el: HTMLElement | null | undefined): string {
  return (el?.text ?? '').replace(/\s+/g, ' ').trim();
}

export function attr(el: HTMLElement | null | undefined, name: string): string | undefined {
  const v = el?.getAttribute(name);
  return v ? v.trim() : undefined;
}

/**
 * Madara commonly lazy-loads images, so the real URL lives in data-src /
 * data-lazy-src / srcset rather than src.
 */
export function imageUrl(el: HTMLElement | null | undefined): string | undefined {
  if (!el) return undefined;
  const candidate =
    attr(el, 'data-src') ??
    attr(el, 'data-lazy-src') ??
    attr(el, 'data-cfsrc') ??
    attr(el, 'src');
  if (candidate) return candidate;
  const srcset = attr(el, 'srcset') ?? attr(el, 'data-srcset');
  if (srcset) return srcset.split(',')[0]?.trim().split(' ')[0];
  return undefined;
}

/** Split block HTML into clean paragraph strings. */
export function extractParagraphs(container: HTMLElement): string[] {
  const nodes = container.querySelectorAll('p');
  let paras: string[];
  if (nodes.length > 0) {
    paras = nodes.map((p) => p.text.replace(/\s+/g, ' ').trim());
  } else {
    // Some sites put text with <br> separators and no <p> tags.
    paras = container.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map((s) => s.replace(/\s+/g, ' ').trim());
  }
  return paras.filter((p) => p.length > 0 && !isJunkParagraph(p));
}

const JUNK_PATTERNS = [
  /please\s+support\s+the\s+translator/i,
  /read\s+the\s+latest\s+chapters?\s+at/i,
  /^advertisement$/i,
  /^\s*$/,
];

function isJunkParagraph(p: string): boolean {
  return JUNK_PATTERNS.some((re) => re.test(p));
}
