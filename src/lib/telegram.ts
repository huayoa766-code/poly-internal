/**
 * Minimal Telegram sender. Reads bot token + chat id from env.
 * If unconfigured, logs to console so the worker is testable without a bot.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export function telegramConfigured(): boolean {
  return Boolean(TOKEN && CHAT_ID);
}

export interface SendOptions {
  /** Telegram forum topic to post into (message_thread_id). */
  threadId?: number;
}

/**
 * Optional category → topic (thread) routing. Set TELEGRAM_TOPICS to a JSON map
 * of category label → numeric thread id, e.g. {"Crypto":12,"Politics":8}. The
 * group must be a forum (Topics enabled). Unmapped categories post to the main
 * thread. Parsed once at module load.
 */
const TOPIC_MAP: Record<string, number> = (() => {
  try {
    const raw = process.env.TELEGRAM_TOPICS;
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
})();

export function topicsConfigured(): boolean {
  return Object.keys(TOPIC_MAP).length > 0;
}

/** Thread id for a category label, if one is mapped. */
export function topicFor(label: string): number | undefined {
  return TOPIC_MAP[label];
}

export async function sendTelegram(text: string, opts: SendOptions = {}): Promise<void> {
  if (!telegramConfigured()) {
    const tag = opts.threadId ? `[telegram:dry-run thread=${opts.threadId}]` : "[telegram:dry-run]";
    console.log(tag + "\n" + text + "\n");
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(opts.threadId ? { message_thread_id: opts.threadId } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram ${res.status}: ${body.slice(0, 160)}`);
  }
}
