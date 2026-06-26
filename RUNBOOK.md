# RUNBOOK — Bring up QueueStorm Investigator

A stranger should be able to copy-paste these steps and have `/health` and `/analyze-ticket`
responding. No guessing steps. The service needs **no secrets** to run (pure rule-based mode).

## Requirements
- Node.js >= 18 (20/22 recommended), **or** Docker.

---

## Option A — Run locally with Node

```bash
git clone <YOUR_REPO_URL> queuestorm && cd queuestorm
npm install
npm start                      # binds 0.0.0.0:8000
```

Verify (in another terminal):

```bash
curl http://localhost:8000/health
# {"status":"ok"}

curl -X POST http://localhost:8000/analyze-ticket \
  -H 'Content-Type: application/json' \
  -d '{"ticket_id":"TKT-001","complaint":"I sent 5000 taka to a wrong number around 2pm today.","transaction_history":[{"transaction_id":"TXN-9101","timestamp":"2026-04-14T14:08:22Z","type":"transfer","amount":5000,"counterparty":"+8801719876543","status":"completed"}]}'
```

Run the test suite and the live smoke test:

```bash
npm test                                   # 26 tests
BASE_URL=http://localhost:8000 npm run smoke
```

---

## Option B — Run with Docker

### B1. Docker Compose (simplest)
```bash
docker compose up --build        # build + run on http://localhost:8000 (add -d to detach)
curl http://localhost:8000/health
docker compose down              # stop
```
Optional DeepSeek: put `DEEPSEEK_API_KEY=...` in a local `.env` (gitignored); Compose passes it through.

### B2. Plain Docker
```bash
docker build -t queuestorm-team .
docker run -p 8000:8000 queuestorm-team           # no secrets needed

# With optional DeepSeek polishing (real secrets via env file ONLY, never committed):
#   printf "DEEPSEEK_API_KEY=sk-...\nMODEL_NAME=deepseek-v4-flash\nPORT=8000\n" > judging.env
docker run -p 8000:8000 --env-file judging.env queuestorm-team
```

Verify the same `curl` commands as Option A against `http://localhost:8000`.

---

## Option C — Deploy a public Live URL

The image binds `0.0.0.0:$PORT` and reads `PORT` from the environment, so it works on most hosts.

### Render (Docker)
1. Push this repo to GitHub.
2. Render → New → **Web Service** → connect the repo.
3. Environment: **Docker**. Render sets `PORT` automatically; the app honors it.
4. (Optional) Add `DEEPSEEK_API_KEY` / `MODEL_NAME` as environment variables in the Render dashboard
   (NOT in the repo).
5. Deploy. Health check path: `/health`.

### Railway (CLI, deploy straight from this machine — no GitHub needed)
The app reads `PORT` and binds `0.0.0.0`, and [`railway.json`](railway.json) pins the Dockerfile
builder + `/health` healthcheck, so Railway works out of the box.

```bash
npm install -g @railway/cli      # install CLI (one time)
railway login                    # opens browser — authorize (YOUR step)
railway init --name queuestorm-investigator   # create a project
railway up                       # build the Dockerfile & deploy from this dir
railway domain                   # generate a public HTTPS URL  -> https://<name>.up.railway.app
# (optional LLM) set a secret in the platform, never in the repo:
#   railway variables --set DEEPSEEK_API_KEY=sk-...
```
Then verify from outside:
```bash
curl https://<your>.up.railway.app/health
BASE_URL=https://<your>.up.railway.app npm run smoke
```
Note: Railway requires an active plan/trial credits on your account.

### Fly.io (alternative)
`fly launch` (uses the Dockerfile) → `fly deploy`. Set `internal_port = 8000` in `fly.toml` (or
`PORT` to match), expose 0.0.0.0.

### After deploying — verify from OUTSIDE the environment
```bash
BASE_URL=https://YOUR-SERVICE-URL npm run smoke
curl https://YOUR-SERVICE-URL/health
```

---

## Secrets policy (important)
- **Never commit** real secrets (`.env`, API keys) to the repo. `.gitignore` already excludes `.env*`
  (except `.env.example`).
- For a deployed endpoint, set secrets as **hosting platform environment variables**.
- For a Docker/code submission that requires a key for judging, provide it via the **private
  submission form field**, not GitHub.
- The service runs fully without any secret (rule-based mode), so judges can always run it.

## Troubleshooting
| Symptom | Fix |
|---|---|
| 404 on `/health` or `/analyze-ticket` | Confirm the base URL and exact route names. |
| Invalid JSON response | Ensure `Content-Type: application/json`; we only emit JSON. |
| Timeout | Pure rule-based mode is ~1–10 ms; if LLM polish is enabled, lower `LLM_TIMEOUT_MS` or unset the key. |
| Port issues on a host | The app reads `PORT` from env and binds `0.0.0.0`. |
