# Deploy Nexus AI permanently (your own link, 24×7)

The Arena preview link (`https://3000-<sandbox>.e2b.app`) is **temporary** — it sleeps
when the agent session ends ("Sandbox Not Found"). For a permanent link you control,
deploy once using any option below. It takes ~5 minutes.

## What Nexus AI needs

- **Node.js 22+** (uses the built-in `node:sqlite`)
- **A persistent disk** for `data/app.db` (SQLite: users, chats, encrypted API keys)
- One env var minimum in production: `AUTH_SECRET` (+ `ENCRYPTION_KEY`, `APP_URL`)

> ⚠️ Serverless platforms without persistent disks (Vercel/Netlify functions) are NOT
> suitable as-is because the SQLite file would reset. Use Railway / Render / Fly / a VPS.

## Option A — Railway (easiest, ~5 min)

1. Push this repo to GitHub (reconnect GitHub in Arena so the agent can push, or push yourself).
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
3. Railway auto-detects the `Dockerfile`. Add a **Volume** mounted at `/app/data`.
4. In **Variables**, set:
   ```
   AUTH_SECRET=<openssl rand -hex 32>
   ENCRYPTION_KEY=<openssl rand -hex 32>
   APP_URL=https://<your-app>.up.railway.app
   ```
5. Deploy → open the generated URL. Done — the same link works forever, on any device.

## Option B — Render (web service + disk)

1. [render.com](https://render.com) → **New → Web Service** → connect your GitHub repo.
2. Environment: **Docker** (uses this repo's Dockerfile).
3. Add a **Persistent Disk** at `/app/data` (any size ≥ 1 GB).
4. Set the same env vars as above. Deploy.

## Option C — Fly.io

```bash
fly launch --no-deploy           # detects the Dockerfile
fly volumes create nexus_data --size 1
fly secrets set AUTH_SECRET=$(openssl rand -hex 32) ENCRYPTION_KEY=$(openssl rand -hex 32) APP_URL=https://<app>.fly.dev
fly deploy
```

## Option D — Any VPS (DigitalOcean / Hetzner / EC2 / home server)

```bash
# with Docker (simplest)
docker build -t nexus-ai .
docker run -d --name nexus-ai --restart unless-stopped \
  -p 3000:3000 \
  -v nexus_data:/app/data \
  -e AUTH_SECRET=$(openssl rand -hex 32) \
  -e ENCRYPTION_KEY=$(openssl rand -hex 32) \
  -e APP_URL=https://your-domain.com \
  nexus-ai
# then put nginx/Caddy with HTTPS in front (Caddy: your-domain.com { reverse_proxy 127.0.0.1:3000 })
```

Without Docker:

```bash
# Node 22+ required
npm ci
npm run build
AUTH_SECRET=... ENCRYPTION_KEY=... APP_URL=https://your-domain.com npm start
```

## Optional env vars

| Variable | Purpose |
|---|---|
| `TAVILY_API_KEY` / `SERPER_API_KEY` / `BRAVE_API_KEY` | reliable web search for the agent |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google login (redirect: `{APP_URL}/api/auth/google/callback`) |
| `MAX_UPLOAD_MB`, `RATE_LIMIT_*` | uploads and rate limits |

## After deploying

Sign up on your new URL, connect your AI provider keys (AI Models → Add provider),
and on your phone Chrome use **⋮ → Install app** (or Safari → Share → Add to Home
Screen on iPhone) — the app icon and offline shell are already built in.

## Backups

Everything lives in `data/app.db` — copy that file (plus `data/.runtime.json` if you
rely on generated secrets; prefer setting `AUTH_SECRET`/`ENCRYPTION_KEY` explicitly).
