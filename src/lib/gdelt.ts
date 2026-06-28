/**
 * GDELT news client. Free, no key. Great geopolitics coverage, ~15-min refresh.
 * HARD CONSTRAINT: GDELT rate-limits to 1 request / 5 seconds, so all calls
 * here are funneled through a global throttle.
 */

const GDELT_DOC = "https://api.gdeltproject.org/api/v2/doc/doc";
const MIN_INTERVAL_MS = 6000; // GDELT requires >=5s; pad for latency/safety

let lastDone = 0;
let chain: Promise<unknown> = Promise.resolve();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Serialize all GDELT calls and ensure >=6s between the END of one request
 * and the START of the next (GDELT measures from when it receives a request).
 */
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastDone);
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      lastDone = Date.now();
    }
  });
  // Keep the chain alive even if a call rejects.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export interface NewsArticle {
  title: string;
  url: string;
  domain: string;
  /** GDELT seendate "YYYYMMDDTHHMMSSZ" -> ISO. */
  publishedAt: string;
  sourceCountry?: string;
}

interface GdeltRaw {
  url: string;
  title: string;
  domain: string;
  seendate: string;
  sourcecountry?: string;
  language?: string;
}

function parseSeendate(s: string): string {
  // "20260628T184500Z" -> "2026-06-28T18:45:00Z"
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return new Date().toISOString();
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

// Drop author bios, tag/section indexes, and homepages that match keywords
// but aren't actual stories — a cheap precision boost for keyword-only search.
const NON_ARTICLE = /\/(people|author|authors|tag|tags|topic|topics|category|categories|section|search|profile|staff)\//i;

function isLikelyArticle(url: string, title: string): boolean {
  if (!title || title.trim().split(/\s+/).length < 4) return false; // headlines have substance
  if (NON_ARTICLE.test(url)) return false;
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    if (path.length < 12) return false; // bare homepages / shallow index pages
  } catch {
    return false;
  }
  return true;
}

export interface NewsOptions {
  /** GDELT timespan, e.g. "1h", "30min", "24h". */
  timespan?: string;
  maxRecords?: number;
  /** Only English by default to reduce noise. */
  englishOnly?: boolean;
}

/** Fetch recent news articles for a GDELT query string. */
export async function fetchNews(query: string, opts: NewsOptions = {}): Promise<NewsArticle[]> {
  const { timespan = "1h", maxRecords = 10, englishOnly = true } = opts;
  if (!query.trim()) return [];

  const finalQuery = englishOnly ? `${query} sourcelang:eng` : query;
  const url = new URL(GDELT_DOC);
  url.searchParams.set("query", finalQuery);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("maxrecords", String(maxRecords));
  url.searchParams.set("timespan", timespan);
  url.searchParams.set("sort", "DateDesc");
  url.searchParams.set("format", "json");

  return throttle(async () => {
    let text = "";
    let status = 0;
    // Retry on 429 / rate-limit text with increasing backoff.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(6000 * attempt);
      const res = await fetch(url, { headers: { "User-Agent": "poly-tracker/0.1" } });
      status = res.status;
      text = await res.text();
      const rateLimited = status === 429 || /limit requests to one every/i.test(text);
      if (!rateLimited) break;
      if (attempt === 2) throw new Error(`GDELT rate-limited after retries: ${text.slice(0, 80)}`);
    }
    if (status >= 400) {
      throw new Error(`GDELT ${status}: ${text.slice(0, 120)}`);
    }
    let json: { articles?: GdeltRaw[] };
    try {
      json = JSON.parse(text);
    } catch {
      // GDELT sometimes returns a plain-text rate-limit/error message with 200.
      throw new Error(`GDELT non-JSON: ${text.slice(0, 120)}`);
    }
    return (json.articles ?? [])
      .filter((a) => isLikelyArticle(a.url, a.title))
      .map((a) => ({
        title: a.title,
        url: a.url,
        domain: a.domain,
        publishedAt: parseSeendate(a.seendate),
        sourceCountry: a.sourcecountry,
      }));
  });
}
