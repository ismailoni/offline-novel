/**
 * Tiny HTTP helper tuned for scraping.
 *
 * On React Native there is no browser, so there is no CORS: we can request
 * cross-origin HTML directly. We set a desktop-browser User-Agent because many
 * WordPress/Madara sites (like novelphoenix.com) reject the default RN agent.
 */

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Request timed out')), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export interface FetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  referer?: string;
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const headers = { ...DEFAULT_HEADERS, ...opts.headers };
  if (opts.referer) headers.Referer = opts.referer;

  const res = await withTimeout(
    fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body,
    }),
    opts.timeoutMs ?? 20000,
  );

  if (!res.ok) throw new HttpError(res.status, url);
  return res.text();
}

/** URL-encode a plain object as application/x-www-form-urlencoded. */
export function formEncode(data: Record<string, string | number>): string {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/** Resolve a possibly-relative URL against a base. */
export function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
