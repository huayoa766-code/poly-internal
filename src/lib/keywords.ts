/**
 * Auto-extract search keywords from a Polymarket market question.
 * Geared toward geopolitics: prioritizes proper-noun entities (countries,
 * people, orgs) plus a curated set of significant topic terms.
 *
 * Deliberately simple (no LLM) per the chosen "keyword match only" design.
 */

// Boilerplate / function words that add no search value.
const STOPWORDS = new Set([
  "will","does","is","are","be","the","a","an","of","to","in","on","by","for",
  "and","or","at","with","before","after","than","this","that","2024","2025",
  "2026","2027","reach","win","won","get","make","made","have","has","end",
  "any","next","first","new","more","less","over","under","up","down","out",
  "who","what","when","which","yes","no","january","february","march","april",
  "may","june","july","august","september","october","november","december",
]);

// Topic terms worth keeping even when lowercase — high-signal in geopolitics.
const TOPIC_TERMS = new Set([
  "ceasefire","war","invasion","sanctions","election","coup","treaty","nuclear",
  "missile","strike","airstrike","troops"," allies","summit","referendum",
  "blockade","truce","peace","annex","tariff","embargo","drone","hostage",
  "withdrawal","escalation","offensive","negotiation","resign","impeach",
]);

function isCapitalized(w: string): boolean {
  return /^[A-Z][a-zA-Z.'-]+$/.test(w);
}

/**
 * Returns an ordered, de-duplicated list of keywords for a market question.
 * Proper-noun entities (collapsed into phrases) come first, then topic terms.
 */
export function extractKeywords(question: string, max = 5): string[] {
  // Tokenize while preserving the original casing.
  const rawTokens = question.replace(/[?!.,()"]/g, " ").split(/\s+/).filter(Boolean);

  const entities: string[] = [];
  const topics: string[] = [];
  let phrase: string[] = [];

  const flush = () => {
    if (phrase.length) {
      entities.push(phrase.join(" "));
      phrase = [];
    }
  };

  for (const tok of rawTokens) {
    const lower = tok.toLowerCase();
    // GDELT rejects sub-3-char keywords (e.g. "US", "x"), so skip short single tokens.
    if (isCapitalized(tok) && tok.length >= 3 && !STOPWORDS.has(lower)) {
      phrase.push(tok); // build up multi-word entity, e.g. "United States"
      continue;
    }
    flush();
    if (tok.length >= 3 && TOPIC_TERMS.has(lower) && !STOPWORDS.has(lower)) {
      topics.push(lower);
    }
  }
  flush();

  const seen = new Set<string>();
  const ordered = [...entities, ...topics].filter((k) => {
    const key = k.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return ordered.slice(0, max);
}

/**
 * Build a GDELT query string from keywords.
 * Entities are AND'd for precision; quotes phrases with spaces.
 */
export function buildNewsQuery(keywords: string[]): string {
  return keywords.map((k) => (k.includes(" ") ? `"${k}"` : k)).join(" ");
}
