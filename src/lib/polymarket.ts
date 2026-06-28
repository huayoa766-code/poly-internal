/**
 * Polymarket Gamma API client (public, no auth required).
 * Docs: https://gamma-api.polymarket.com  (markets/events metadata)
 *
 * We only use read endpoints here. A wallet/CLOB key is only needed later
 * for live order-book depth or personal positions — not for bookmarking.
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";

/** Raw shape of a market as returned by Gamma (subset we care about). */
export interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  category?: string;
  endDate?: string;
  closed?: boolean;
  active?: boolean;
  volume?: string | number;
  liquidity?: string | number;
  // JSON-encoded string arrays, e.g. '["Yes","No"]' and '["0.62","0.38"]'
  outcomes?: string;
  outcomePrices?: string;
}

/** Normalized market for app use. */
export interface Market {
  id: string;
  question: string;
  slug: string;
  category: string | null;
  endDate: string | null;
  closed: boolean;
  volume: number;
  outcomes: { name: string; price: number }[];
}

function toNumber(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/** Safely parse Gamma's JSON-encoded string arrays. */
function parseJsonArray(s: string | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function normalizeMarket(m: GammaMarket): Market {
  const names = parseJsonArray(m.outcomes);
  const prices = parseJsonArray(m.outcomePrices);
  return {
    id: String(m.id),
    question: m.question,
    slug: m.slug,
    category: m.category ?? null,
    endDate: m.endDate ?? null,
    closed: Boolean(m.closed),
    volume: toNumber(m.volume),
    outcomes: names.map((name, i) => ({ name, price: toNumber(prices[i]) })),
  };
}

async function gammaFetch(path: string, params: Record<string, string | number | boolean | undefined>): Promise<unknown> {
  const url = new URL(GAMMA_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // Gamma data is fine to cache briefly; tune per call site.
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Gamma API ${res.status} for ${url.pathname}${url.search}`);
  }
  return res.json();
}

export interface SearchOptions {
  /** Substring matched client-side against the question (Gamma lacks full text search here). */
  query?: string;
  category?: string;
  limit?: number;
  offset?: number;
  /** Only open markets by default. */
  includeClosed?: boolean;
}

/**
 * List/search markets.
 * - With a query: uses Gamma's full-text `/public-search` (returns events with
 *   nested markets) so matches aren't limited to top-volume markets.
 * - Without a query: browses top markets by volume via `/markets`.
 */
export async function searchMarkets(opts: SearchOptions = {}): Promise<Market[]> {
  const { query, category, limit = 50, offset = 0, includeClosed = false } = opts;

  let markets: Market[];

  if (query && query.trim()) {
    const data = (await gammaFetch("/public-search", {
      q: query.trim(),
      limit_per_type: 30,
      events_status: includeClosed ? undefined : "active",
    })) as { events?: GammaEvent[] };
    const events = data.events ?? [];
    // Flatten event -> markets and de-duplicate by market id.
    const byId = new Map<string, Market>();
    for (const e of events) {
      for (const m of e.markets ?? []) {
        const nm = normalizeMarket(m);
        if (!byId.has(nm.id)) byId.set(nm.id, nm);
      }
    }
    markets = [...byId.values()];
    if (!includeClosed) markets = markets.filter((m) => !m.closed);
  } else {
    const data = (await gammaFetch("/markets", {
      closed: includeClosed ? undefined : false,
      active: true,
      limit,
      offset,
      order: "volume",
      ascending: false,
    })) as GammaMarket[];
    markets = (Array.isArray(data) ? data : []).map(normalizeMarket);
  }

  if (category) {
    const c = category.toLowerCase();
    markets = markets.filter((m) => (m.category ?? "").toLowerCase() === c);
  }
  return markets.slice(0, limit);
}

/** Fetch a single market by its Gamma id (used by the polling worker). */
export async function getMarket(id: string): Promise<Market | null> {
  const data = (await gammaFetch(`/markets/${id}`, {})) as GammaMarket | null;
  if (!data || !data.id) return null;
  return normalizeMarket(data);
}

/** A Gamma event groups one or more markets (a Polymarket /event/<slug> URL). */
interface GammaEvent {
  id: string;
  slug: string;
  title?: string;
  markets?: GammaMarket[];
}

/**
 * Extract the slug from a Polymarket URL or raw slug.
 * Handles polymarket.com/event/<slug>, /market/<slug>, query strings, and bare slugs.
 */
export function parseSlug(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const url = new URL(s);
    const parts = url.pathname.split("/").filter(Boolean); // ["event","my-slug"]
    const last = parts[parts.length - 1];
    return last || null;
  } catch {
    // Not a URL — treat as a bare slug (strip any trailing query/hash).
    return s.split(/[?#]/)[0] || null;
  }
}

/**
 * Resolve a slug (event or market) to its market(s).
 * Tries the markets endpoint first (single market), then the events endpoint
 * (returns every market contained in that event).
 */
export async function resolveSlugToMarkets(slug: string): Promise<Market[]> {
  const asMarket = (await gammaFetch("/markets", { slug })) as GammaMarket[];
  if (Array.isArray(asMarket) && asMarket.length > 0) {
    return asMarket.map(normalizeMarket);
  }
  const asEvent = (await gammaFetch("/events", { slug })) as GammaEvent[];
  if (Array.isArray(asEvent) && asEvent.length > 0 && asEvent[0].markets) {
    return asEvent[0].markets.map(normalizeMarket);
  }
  return [];
}
