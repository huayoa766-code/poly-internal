# Poly Tracker

Internal tool to **bookmark Polymarket markets**, organize them by category, and get
**Telegram alerts** on price moves, deadlines, and relevant news. Built for a
geopolitics-focused watchlist.

## Stack

- **Next.js 16** (App Router) — dashboard + market search UI
- **Prisma + SQLite** — local storage (swap to Postgres for deploy)
- **node-cron worker** — polls bookmarks, detects moves, fetches news, sends alerts
- **GDELT** (free) for news; **Telegram Bot API** for notifications

No trading credentials are used — the tool only reads public market data and notifies.

## Setup

```bash
npm install
cp .env.example .env        # then edit .env
npx prisma migrate dev      # create the SQLite db
npm run dev                 # http://localhost:3000
```

### Add bookmarks

- **Find markets** tab → search and bookmark, **or**
- Dashboard → **Import from Polymarket** → paste watchlist URLs (one per line).
  An event URL imports all of its markets. (Polymarket's account watchlist has no
  public API, so paste-import is the supported path.)

## Notifications (Telegram)

1. In Telegram, message **@BotFather** → `/newbot` → copy the **bot token**.
2. Send your new bot any message (e.g. "hi").
3. Get your **chat id**:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates"
   # look for "chat":{"id":<NUMBER> ...
   ```
4. Put both in `.env`:
   ```
   TELEGRAM_BOT_TOKEN="123:abc..."
   TELEGRAM_CHAT_ID="123456789"
   ```

Without these, the worker runs in **dry-run** (alerts print to the console).

## Running the alert worker

```bash
npm run worker     # long-running: alert pass every 15 min + daily digest at 09:00
npm run pass       # run a single pass once (handy for testing)
```

Tuning lives in `.env` (`PRICE_MOVE_THRESHOLD`, `DEADLINE_HOURS`, `NEWS_TIMESPAN`,
`POLL_CRON`, `DIGEST_CRON`).

### Alert types

| Type | Fires when |
|------|------------|
| Price move | primary outcome moves ≥ `PRICE_MOVE_THRESHOLD` (default 5 pts) vs last snapshot |
| Deadline | market closes within `DEADLINE_HOURS` |
| Resolution | market flips to closed |
| News | fresh GDELT headlines match auto-extracted keywords |
| Daily digest | once a day, summary of all tracked markets |

Duplicate alerts are suppressed via the `SentAlert` dedupe log.

## Notes / limits

- **GDELT** rate-limits to 1 request / 5s; the client throttles + retries automatically.
- News matching is **keyword-only** (no LLM) — fast but occasionally noisy. An LLM
  relevance pass and X/Twitter sentiment are designed-for but not yet built.
- Polymarket's API was occasionally unreachable from some networks (transient, not a
  hard geo-block).
