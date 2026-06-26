# TRACKING — Live Task Board

Status key: ☐ not started · ◐ in progress · ✔ done · ⛔ blocked

| ID | Task | Status | Notes / Verification |
|----|------|--------|----------------------|
| T0 | Tracking & context docs | ✔ | PROJECT_SPEC, TRACKING, CONTEXT, DECISIONS, TEST_MATRIX created |
| T1 | Express skeleton + /health + /analyze-ticket, bind 0.0.0.0 | ✔ | curl /health → {"status":"ok"}; POST → 200 + 10 fields (server.test.js) |
| T2 | Request validation → 400/422, never crash | ✔ | {} → 400, empty complaint → 422, bad JSON → 400, stays alive (server.test.js) |
| T3 | Extraction (amounts incl. Bangla, type, intent) | ✔ | Bangla ২০০০ parsed; phone/year noise filtered |
| T4 | Transaction matching + evidence_verdict | ✔ | 10/10 sample id+verdict exact (samples.test.js) |
| T5 | Classification: case_type, department, severity, human_review | ✔ | 10/10 sample exact on all 4 fields |
| T6 | Safe reply + summary + next action (language-aware) | ✔ | safety battery clean; Bangla in → Bangla out (verified live) |
| T7 | ~~Optional LLM polish + timeout + safety re-filter + fallback~~ | ⛔ | **Removed/superseded:** LLM dropped — service is a pure deterministic rule engine (no polish step). |
| T8 | Test harness: 10 samples + adversarial + HTTP | ✔ | 26/26 pass; live_smoke max latency 11ms |
| T9 | Dockerize (<500MB, 0.0.0.0, no secrets) | ✔ | **Built & verified: image 321MB**, binds 0.0.0.0:8000, /health ok, 10/10 samples pass in-container (max 8ms). |
| T10 | Deploy live URL (Railway) | ✔ | **LIVE: https://queuestorm-investigator-production-cab1.up.railway.app** — 10/10 samples pass over internet, max 430ms. Docker Compose added (`docker compose up --build`, tested). |
| T11 | Deliverables: README + MODELS + sample_output + RUNBOOK | ✔ | README (w/ MODELS), RUNBOOK, .env.example, sample_output.json, .gitignore, .dockerignore. Secret scan clean. |
| T12 | /graphify refresh | ✔ | graph updated: 401 nodes, 565 edges, 28 communities (incl. rubric compliance, manual testing). Query with `/graphify query "…"` |
| T13 | ~~DeepSeek LLM + AI-output evaluation + rubric/manual docs~~ | ⛔ | **Removed/superseded:** LLM/DeepSeek + AI-output evaluation dropped — service is pure rules, makes zero outbound calls, needs zero API keys (only `PORT`). docs/RUBRIC_COMPLIANCE.md + docs/MANUAL_TESTING.md retained. |

## Outstanding (needs the CEO / team)
1. **Deploy** to a public host (Render/Railway/Fly) → get the Live URL (T10).
2. **Build the Docker image** once on a machine with Docker to confirm <500MB + `/health` (T9).
3. **Create the GitHub repo**, push, and grant organizer handle **bipulhf** access.
4. **Submission form**: team info, repo URL, Live URL/Docker cmd, sample req/resp, AI usage, safety
   explanation, known limits, "no real data" + "no secrets" confirmations.
5. (Optional) record the ≤90s architecture video.

## Session log
- (init) Read all 4 specs + 10 sample cases. Locked stack=Node/Express, engine=deterministic rules, deploy=Docker→Render. (Spec permits external LLM providers; we use none — pure rules.)
- Built full service: server, validate, extract, classify, match, reply, safety, analyze.
- Tests: 26/26 pass (10 samples exact-match, adversarial safety, HTTP contract). Live smoke 10/10, max 11ms.
- Deliverables written; secret scan clean; no .env in repo. Docker build pending (no local Docker).
