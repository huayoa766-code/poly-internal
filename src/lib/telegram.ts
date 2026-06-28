/**
 * Minimal Telegram sender. Reads bot token + chat id from env.
 * If unconfigured, logs to console so the worker is testable without a bot.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export function telegramConfigured(): boolean {
  return Boolean(TOKEN && CHAT_ID);
}

export async function sendTelegram(text: string): Promise<void> {
  if (!telegramConfigured()) {
    console.log("[telegram:dry-run]\n" + text + "\n");
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
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram ${res.status}: ${body.slice(0, 160)}`);
  }
}
