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

/** Statuses that are worth retrying after a polite wait (rate limit / transient). */
const RETRYABLE_STATUS = new Set([429, 503]);

function delayMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse a `Retry-After` header. It is either a number of seconds or an
 * HTTP-date. Returns milliseconds to wait, or undefined if unparseable.
 */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(value);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return undefined;
}

/**
 * Detect a Cloudflare (or similar) challenge/error page. These come back as
 * HTML — sometimes even with a 200/403 — instead of the expected markup, so
 * we must not mistake them for a real (empty) page.
 */
export function isChallengePage(html: string): boolean {
  const head = html.slice(0, 4000);
  return (
    /class="no-js ie6 oldie"/i.test(head) ||
    /cf-browser-verification|cf_chl_|__cf_chl|challenge-platform/i.test(head) ||
    /Attention Required!|Just a moment\.\.\./i.test(head) ||
    /Checking your browser before accessing/i.test(head)
  );
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
  /**
   * Max retry attempts for rate-limited / transient responses (429/503) and
   * Cloudflare challenge pages. Defaults to 4. Set 0 to disable retrying.
   */
  retries?: number;
  /** Base backoff in ms for the exponential retry schedule. Defaults to 1000. */
  retryBaseMs?: number;
  /** Upper bound on any single backoff wait. Defaults to 30s. */
  maxBackoffMs?: number;
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const headers = { ...DEFAULT_HEADERS, ...opts.headers };
  if (opts.referer) headers.Referer = opts.referer;

  const maxRetries = opts.retries ?? 4;
  const baseMs = opts.retryBaseMs ?? 1000;
  const maxBackoffMs = opts.maxBackoffMs ?? 30000;

  let attempt = 0;
  // Loop until we succeed, exhaust retries, or hit a non-retryable error.
  for (;;) {
    const res = await withTimeout(
      fetch(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body,
      }),
      opts.timeoutMs ?? 20000,
    );

    if (res.ok) {
      const body = await res.text();
      // A 200 that is actually a challenge page must not be treated as real
      // markup — back off and retry, otherwise the caller parses garbage.
      if (isChallengePage(body) && attempt < maxRetries) {
        await delayMs(backoff(attempt, baseMs, maxBackoffMs));
        attempt++;
        continue;
      }
      return body;
    }

    if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      const wait = retryAfter ?? backoff(attempt, baseMs, maxBackoffMs);
      await delayMs(Math.min(wait, maxBackoffMs));
      attempt++;
      continue;
    }

    throw new HttpError(res.status, url);
  }
}

/** Exponential backoff with a small deterministic jitter, clamped to a ceiling. */
function backoff(attempt: number, baseMs: number, maxMs: number): number {
  const exp = baseMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * baseMs);
  return Math.min(exp + jitter, maxMs);
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
