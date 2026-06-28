/**
 * Background worker: runs the alert pass on a schedule + a daily digest.
 * Run with: npm run worker
 *
 * Env:
 *   POLL_CRON          cron for alert passes (default every 15 min)
 *   DIGEST_CRON        cron for daily digest (default 09:00 daily)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  (omit -> dry-run to console)
 *   PRICE_MOVE_THRESHOLD, DEADLINE_HOURS, NEWS_TIMESPAN  (see src/lib/alerts.ts)
 */

import "dotenv/config";
import cron from "node-cron";
import { runAlertPass, sendDailyDigest, alertsReady } from "../src/lib/alerts";

const POLL_CRON = process.env.POLL_CRON ?? "*/15 * * * *";
const DIGEST_CRON = process.env.DIGEST_CRON ?? "0 9 * * *";

let running = false;

async function pass() {
  if (running) {
    console.log("[worker] previous pass still running, skipping");
    return;
  }
  running = true;
  const t = Date.now();
  try {
    const stats = await runAlertPass();
    console.log(
      `[worker] pass done in ${((Date.now() - t) / 1000).toFixed(1)}s`,
      JSON.stringify(stats),
    );
  } catch (e) {
    console.error("[worker] pass failed:", (e as Error).message);
  } finally {
    running = false;
  }
}

console.log("[worker] starting");
console.log("[worker] telegram:", alertsReady().telegram ? "configured" : "DRY-RUN (console)");
console.log(`[worker] poll schedule: ${POLL_CRON} | digest: ${DIGEST_CRON}`);

cron.schedule(POLL_CRON, pass);
cron.schedule(DIGEST_CRON, () => {
  sendDailyDigest().catch((e) => console.error("[worker] digest failed:", (e as Error).message));
});

// Run one pass immediately on startup.
pass();
