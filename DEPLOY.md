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
3. Put it in your local `.env` as `DATABASE_URL`, then create the schema:
   ```bash
   npx prisma migrate deploy
   ```
4. (Optional) re-import your watchlist on the dashboard once deployed.

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

## 3. GitHub Secrets (for the worker)

Repo → **Settings → Secrets and variables → Actions → New repository secret**. Add:

- `DATABASE_URL` — the Neon string
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Then test it: **Actions → alert-worker → Run workflow**. You should get Telegram
alerts (or a clean run if nothing has moved).

## 4. UI — Vercel

1. <https://vercel.com> → sign in with GitHub → **Add New… → Project** → import the repo.
2. **Environment Variables** — add the same three (`DATABASE_URL`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).
3. **Deploy**. Vercel auto-runs `prisma generate` (via `postinstall`) and builds.

Your dashboard is now at `https://<project>.vercel.app`.

---

### Notes

- Scheduled GitHub Actions use **UTC** and may be delayed a few minutes under load.
- The worker runs `npm run pass` (one pass, then exits) — not the long-running
  `npm run worker`. The daily digest is a separate workflow (`digest.yml`).
- To change alert tuning in production, edit the `env:` block in
  `.github/workflows/worker.yml` (`PRICE_MOVE_THRESHOLD`, `DEADLINE_HOURS`, …).
- Local dev now also needs a Postgres `DATABASE_URL` (use your Neon string, or a
  Neon dev branch).
