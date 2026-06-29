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

/** Automatic grouping/category info derived from a market's Gamma event. */
export interface MarketGrouping {
  seriesId: string | null;
  seriesTitle: string | null;
  seriesRecurrence: string | null;
  eventSlug: string | null;
  eventTitle: string | null;
  /** Predefined Polymarket tag labels, e.g. ["Crypto","Bitcoin"]. */
  tags: string[];
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
  /** Present when the market was resolved with its event context. */
  grouping?: MarketGrouping;
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

interface GammaSeries {
  id: string;
  title?: string;
  slug?: string;
  recurrence?: string;
}

interface GammaTag {
  id?: string;
  label?: string;
  slug?: string;
}

/** A Gamma event groups one or more markets (a Polymarket /event/<slug> URL). */
interface GammaEvent {
  id: string;
  slug: string;
  title?: string;
  markets?: GammaMarket[];
  series?: GammaSeries[];
  tags?: GammaTag[];
}

/** A Gamma market enriched with its parent event(s) and tags (include_tag=true). */
interface GammaMarketWithEvent extends GammaMarket {
  events?: GammaEvent[];
  tags?: GammaTag[];
}

function tagLabels(tags: GammaTag[] | undefined): string[] {
  if (!tags) return [];
  // Drop Polymarket's internal housekeeping tags so the category filter stays clean.
  const HIDDEN = new Set(["hide from new", "recurring"]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const label = t.label?.trim();
    if (!label || HIDDEN.has(label.toLowerCase()) || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/** Build grouping info from an event object and (optionally) market-level tags. */
function groupingFromEvent(
  event: GammaEvent | undefined,
  marketTags?: GammaTag[],
): MarketGrouping {
  const series = event?.series?.[0];
  // Prefer market-level tags (richer), fall back to the event's tags.
  const tags = tagLabels(marketTags && marketTags.length ? marketTags : event?.tags);
  return {
    seriesId: series?.id ?? null,
    seriesTitle: series?.title ?? null,
    seriesRecurrence: series?.recurrence ?? null,
    eventSlug: event?.slug ?? null,
    eventTitle: event?.title ?? null,
    tags,
  };
}

/**
 * Fetch a single market by id, enriched with its event/series/tags.
 * Used by backfill and the worker refresh, where only a market id is known.
 * (The plain `/markets/{id}` endpoint omits events/tags, so we use the list
 * endpoint with `include_tag=true`, which hydrates them.)
 */
export async function getMarketWithGrouping(id: string): Promise<Market | null> {
  const data = (await gammaFetch("/markets", {
    id,
    include_tag: true,
  })) as GammaMarketWithEvent[] | null;
  const raw = Array.isArray(data) ? data[0] : null;
  if (!raw || !raw.id) return null;
  const market = normalizeMarket(raw);
  market.grouping = groupingFromEvent(raw.events?.[0], raw.tags);
  return market;
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
  // Prefer the event endpoint: it returns the event's series + tags, so we can
  // capture grouping for every contained market in a single request.
  const asEvent = (await gammaFetch("/events", { slug })) as GammaEvent[];
  if (Array.isArray(asEvent) && asEvent.length > 0 && asEvent[0].markets?.length) {
    const event = asEvent[0];
    const grouping = groupingFromEvent(event);
    return event.markets!.map((m) => {
      const nm = normalizeMarket(m);
      nm.grouping = grouping;
      return nm;
    });
  }
  // Fall back to a bare market slug; enrich each by id to capture grouping.
  const asMarket = (await gammaFetch("/markets", { slug })) as GammaMarket[];
  if (Array.isArray(asMarket) && asMarket.length > 0) {
    return Promise.all(
      asMarket.map(async (m) => {
        const enriched = await getMarketWithGrouping(String(m.id));
        return enriched ?? normalizeMarket(m);
      }),
    );
  }
  return [];
}
