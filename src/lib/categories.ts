/**
 * Resolve a bookmark's Polymarket tags into a single broad category for
 * organizing Telegram messages (digest sections, alert prefixes, topic routing).
 *
 * Markets carry several granular tags (e.g. ["Bitcoin","Weekly","Crypto"]); we
 * collapse them to one human bucket with an emoji, in a stable priority order.
 */

export interface Category {
  label: string;
  emoji: string;
}

// First match wins, so order = priority. `match` entries are lowercased tag
// labels (or pmCategory values) that map into this bucket.
const CATEGORY_DEFS: { label: string; emoji: string; match: string[] }[] = [
  { label: "Politics", emoji: "🗳", match: ["politics", "elections", "election", "trump", "geopolitics", "world", "us politics"] },
  { label: "Crypto", emoji: "📈", match: ["crypto", "bitcoin", "ethereum", "crypto prices", "solana"] },
  { label: "Sports", emoji: "⚽", match: ["sports", "soccer", "football", "nfl", "nba", "mlb", "tennis", "f1", "cricket"] },
  { label: "Economy", emoji: "💵", match: ["economy", "econ", "fed", "inflation", "interest rates", "rates", "macro", "jobs"] },
  { label: "Tech & AI", emoji: "🤖", match: ["tech", "ai", "openai", "science", "space"] },
  { label: "Business", emoji: "🏢", match: ["business", "companies", "earnings", "stocks", "markets"] },
  { label: "Culture", emoji: "🎬", match: ["pop culture", "culture", "entertainment", "movies", "music", "awards"] },
];

const FALLBACK: Category = { label: "Other", emoji: "📌" };

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse the JSON-encoded pmTags column into a string array. */
export function parsePmTags(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Pick the broad category for a bookmark from its tags + Polymarket category. */
export function categoryOf(input: {
  pmTags: string | null;
  pmCategory: string | null;
}): Category {
  const tags = parsePmTags(input.pmTags);
  const set = new Set(
    [...tags, input.pmCategory].filter(Boolean).map((s) => s!.toLowerCase()),
  );
  for (const def of CATEGORY_DEFS) {
    if (def.match.some((m) => set.has(m))) {
      return { label: def.label, emoji: def.emoji };
    }
  }
  // No broad bucket matched — degrade gracefully to the raw Polymarket category
  // or the first tag, so messages still carry *something* meaningful.
  if (input.pmCategory) return { label: titleCase(input.pmCategory), emoji: FALLBACK.emoji };
  if (tags[0]) return { label: tags[0], emoji: FALLBACK.emoji };
  return FALLBACK;
}

/** Priority index for sorting category sections (lower = earlier; Other last). */
export function categoryOrder(label: string): number {
  const i = CATEGORY_DEFS.findIndex((d) => d.label === label);
  return i === -1 ? CATEGORY_DEFS.length + 1 : i;
}
