# Deployment guide

All-free stack:

| Piece | Service | Cost |
|-------|---------|------|
| Database | **Neon** (Postgres) | free |
| Worker (alert passes + digest) | **GitHub Actions** (cron) | free |
| UI dashboard | **Vercel** | free |

The worker and DB run 24/7 so alerts fire even when your laptop is off. The UI is
optional but lets you open the dashboard from your phone.

---

## 1. Database — Neon

1. Go to <https://neon.tech> → sign in with GitHub → **Create project**.
2. Copy the **connection string** (use the **direct** one, i.e. the host *without*
   `-pooler`). It looks like:
   `postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require`
3. Put it in your local `.env` as `DATABASE_URL`.

The schema is created by the **migrate** GitHub Action (step 3 below) — no local
DB command needed. (If you ever want to run it by hand from your own machine:
`npx prisma migrate deploy`.)

## 2. Push to GitHub

1. Create a repo at <https://github.com/new> (e.g. `poly-internal`).
   - **Public** → unlimited free Actions minutes (recommended; no secrets are in the
     code — they live in GitHub Secrets).
   - **Private** → ~2000 free min/month; change the worker cron to hourly
     (`0 * * * *` in `.github/workflows/worker.yml`) to stay free.
2. Connect and push:
   ```bash
   git remote add origin https://github.com/<you>/poly-internal.git
   git push -u origin master
   ```

## 3. GitHub Secrets + create the schema

Repo → **Settings → Secrets and variables → Actions → New repository secret**. Add:

- `DATABASE_URL` — the Neon string
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Now create the database schema: **Actions → migrate → Run workflow**. It runs
`prisma migrate deploy` against Neon. (It also runs automatically whenever you push
migration changes.)

Then test the worker: **Actions → alert-worker → Run workflow** — you should get
Telegram alerts (or a clean run if nothing has moved).

## 4. UI — Vercel

1. <https://vercel.com> → sign in with GitHub → **Add New… → Project** → import the repo.
2. **Environment Variables** — add the same three (`DATABASE_URL`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), plus **`DASHBOARD_PIN`** (a 6-digit
   PIN) and **`AUTH_SECRET`** (any long random string) to lock the public URL —
   see below.
3. **Deploy**. Vercel auto-runs `prisma generate` (via `postinstall`) and builds.

Your dashboard is now at `https://<project>.vercel.app`.

---

### Notes

- **PIN-locking the dashboard.** Because the Vercel URL is public, set
  `DASHBOARD_PIN` (6 digits) and `AUTH_SECRET` (a long random string) in the
  Vercel env. Every request is then bounced to a `/login` popup until the PIN is
  entered; a signed, http-only cookie keeps you in for 30 days, and **🔒 Lock**
  in the header clears it. Rotating `DASHBOARD_PIN` invalidates existing
  sessions. Leave `DASHBOARD_PIN` blank to disable the gate (e.g. local dev).
  The worker doesn't serve the UI, so it needs neither var.
- Scheduled GitHub Actions use **UTC** and may be delayed a few minutes under load.
- The worker runs `npm run pass` (one pass, then exits) — not the long-running
  `npm run worker`. The daily digest is a separate workflow (`digest.yml`).
- To change alert tuning in production, edit the `env:` block in
  `.github/workflows/worker.yml` (`PRICE_MOVE_THRESHOLD`, `DEADLINE_HOURS`, …).
- **Ended markets self-clean.** A bookmark whose end date has passed disappears
  from the dashboard immediately (kept in a collapsible "Recently ended"
  section) and is hard-deleted by the next worker pass once it's been ended for
  `ENDED_GRACE_DAYS` days (default 7). Set `ENDED_GRACE_DAYS` in
  `worker.yml`'s `env:` to change the window.
- **Telegram messages are organized by category** (from each market's Polymarket
  tags). The daily digest is split into category sections with recurring
  date-variants collapsed under their series, and each alert is tagged with its
  category. Optional secrets to customize delivery:
  - `DIGEST_MODE=split` — send one digest message per category instead of one
    combined message.
  - `TELEGRAM_TOPICS` — JSON map of category → forum topic id, e.g.
    `{"Crypto":12,"Politics":8}`. Requires the group to have **Topics** enabled
    (make it a forum); each category's digest + alerts then post to its topic.
    Setting this auto-enables per-category split. Get a topic's id from the
    `message_thread_id` of any message in that topic (or via `getUpdates`).
- Local dev now also needs a Postgres `DATABASE_URL` (use your Neon string, or a
  Neon dev branch).
