# QueueStorm Investigator

An AI/API support copilot for fintech transaction disputes — built for the
**bKash presents SUST CSE Carnival 2026 · Codex Community Hackathon (Online Preliminary)**.

It reads one customer complaint plus a short transaction-history snippet and returns a single
structured JSON verdict that **investigates** the case (which transaction, does the evidence support
the claim), **classifies** and **routes** it, and drafts a **safe** customer reply — never asking for
credentials and never promising a refund it has no authority to confirm.

> Design principle: it is a complaint **investigator**, not a classifier; a **copilot**, not an
> authority. When the evidence is unclear, it says so (`insufficient_data`) instead of guessing.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (>=18; tested on 20/22) |
| HTTP framework | Express 4 |
| Engine | Deterministic rule-based core (no model required) |
| Optional polish | DeepSeek (OpenAI-compatible API, off by default) |
| Tests | Node's built-in `node:test` (zero extra deps) |
| Container | `node:20-slim` Docker image (< 500 MB) |

Only one runtime dependency (`express`), so the image is tiny and cold starts are fast.

## AI approach

This is a **hybrid, rules-first** system:

- **The reasoning is 100% deterministic.** Evidence matching (`relevant_transaction_id`),
  `evidence_verdict`, `case_type`, `department`, `severity`, `human_review_required`, and **all
  safety guardrails** are computed by pure functions. This makes the scored decisions reproducible,
  fast (~1–10 ms/request), explainable, and free of API-cost/quota/latency risk.
- **An LLM is optional and only rephrases `customer_reply`.** If an API key is configured, the reply
  text is passed to an LLM for a more natural phrasing, then **evaluated** by
  [`evaluatePolishedReply()`](src/safety.js): it is accepted only if it passes the safety screen, keeps
  the same transaction id (no hallucinated `TXN-…`), preserves the language, and stays a sane length.
  On any timeout/error/missing-key/failed-check it silently falls back to the rules-generated reply.
  The LLM never influences the verdict, classification, routing, or safety decision.
- **Provider: DeepSeek.** Set `DEEPSEEK_API_KEY` to enable polishing (defaults to `deepseek-v4-flash`;
  override with `MODEL_NAME`). DeepSeek's API is OpenAI-compatible. With no key the service runs fully
  in deterministic mode.

This directly fits the rubric: Evidence Reasoning (35) and Safety (20) are deterministic and always
correct-by-construction, while still allowing nicer prose for the Response Quality (10) manual review.

### MODELS

| Model | Where it runs | Why / role | Required? |
|---|---|---|---|
| **Deterministic rule engine** (our own code) | In-process, on the API host | Primary engine: all evidence reasoning, classification, routing, and safety | **Yes (always on)** |
| **DeepSeek** (`deepseek-v4-flash` default; any DeepSeek model via `MODEL_NAME`) | DeepSeek API over HTTPS, 8 s timeout | Optional: rephrase `customer_reply` only; output evaluated for safety + txn-id + language; rules fallback | No (set `DEEPSEEK_API_KEY`) |

No GPU, no local model weights, no multi-GB downloads, no runtime training. The service scores fully
in pure rule-based mode with **zero API keys**.

## Safety logic (the disqualifier zone)

Every `customer_reply` — whether rules-generated or LLM-polished — passes through
[`src/safety.js`](src/safety.js) before it leaves the service. It blocks:

1. **Credential requests** — any imperative to share/enter PIN/OTP/password/card (a negated line like
   "do not share your OTP" is allowed). *(−15 penalty avoided.)*
2. **Unauthorized promises** — "we will refund/reverse/unblock…". We only ever say *"any eligible
   amount will be returned through official channels."* *(−10 penalty avoided.)*
3. **Third-party redirection** — phone numbers, URLs, or "send money to…" in the reply. We direct
   customers only to official channels. *(−10 penalty avoided.)*
4. **Prompt injection** — complaint text is treated purely as data; embedded "instructions" never
   change behavior because the decision path is rule-based.

If a reply ever failed the screen, the service substitutes a known-safe generic reply rather than
ship anything unsafe.

## Setup & run

```bash
# 1. Install (one dependency)
npm install

# 2. Run the service (binds 0.0.0.0:8000)
npm start
# or: PORT=8000 node src/server.js

# 3. Verify
curl http://localhost:8000/health           # -> {"status":"ok"}
```

### Run the tests

```bash
npm test          # 26 tests: 10 sample cases + safety battery + HTTP contract
```

### Live smoke test (local or deployed)

```bash
BASE_URL=http://localhost:8000 npm run smoke   # POSTs all 10 sample inputs, checks schema/safety/latency
```

### Optional: enable DeepSeek reply polishing

```bash
export DEEPSEEK_API_KEY=sk-...        # enables optional polishing
export MODEL_NAME=deepseek-v4-flash   # optional (any DeepSeek model)
npm start
```

## API

### `GET /health`
Returns `{"status":"ok"}` (readiness; responds within 60 s of startup).

### `POST /analyze-ticket`

**Request** (required: `ticket_id`, `complaint`; everything else optional):

```json
{
  "ticket_id": "TKT-001",
  "complaint": "I sent 5000 taka to a wrong number around 2pm today...",
  "language": "en",
  "channel": "in_app_chat",
  "user_type": "customer",
  "transaction_history": [
    { "transaction_id": "TXN-9101", "timestamp": "2026-04-14T14:08:22Z", "type": "transfer", "amount": 5000, "counterparty": "+8801719876543", "status": "completed" }
  ]
}
```

**Response** (all 10 required fields, exact enum values):

```json
{
  "ticket_id": "TKT-001",
  "relevant_transaction_id": "TXN-9101",
  "evidence_verdict": "consistent",
  "case_type": "wrong_transfer",
  "severity": "high",
  "department": "dispute_resolution",
  "agent_summary": "Customer reports sending 5000 BDT via TXN-9101 to a recipient they now believe was incorrect. Requires dispute review.",
  "recommended_next_action": "Verify TXN-9101 details with the customer and initiate the wrong-transfer dispute workflow per policy.",
  "customer_reply": "We have noted your concern about transaction TXN-9101. Please do not share your PIN or OTP with anyone. Our dispute team will review the case and contact you through official support channels.",
  "human_review_required": true,
  "confidence": 0.9,
  "reason_codes": ["wrong_transfer", "transaction_match", "dispute_initiated"]
}
```

**HTTP codes:** `200` success · `400` malformed input / missing required field · `422` empty complaint
· `500` internal error (non-sensitive message). The service never crashes on bad input.

See [`sample_output.json`](sample_output.json) for our output on all 10 public sample cases.

## Deployment

The repo ships a `Dockerfile` (binds `0.0.0.0`, `< 500 MB`, secrets via env only). See
[`RUNBOOK.md`](RUNBOOK.md) for copy-paste deploy steps (local, Docker, Render/Railway/Fly).

```bash
docker build -t queuestorm-team .
docker run -p 8000:8000 --env-file judging.env queuestorm-team
```

## How the reasoning works (brief)

1. **Extract** signals from the complaint — amounts (incl. Bangla numerals ০–৯), transaction-type
   words, intent flags (phishing/duplicate/failed/refund/…), language. ([`src/extract.js`](src/extract.js))
2. **Classify** `case_type` by a fixed priority order so safety-critical signals win. ([`src/classify.js`](src/classify.js))
3. **Match** the transaction and decide `evidence_verdict`: one clear match → `consistent`; data
   contradicts the claim (e.g. established payee) → `inconsistent`; ambiguous/absent → `null` +
   `insufficient_data`; duplicate pair → the later charge. ([`src/match.js`](src/match.js))
4. **Route** department/severity/human-review from case_type + evidence. ([`src/classify.js`](src/classify.js))
5. **Reply** with safe, language-mirrored text; optional LLM polish; final safety screen. ([`src/reply.js`](src/reply.js), [`src/safety.js`](src/safety.js))

## Assumptions

- All complaints and transactions are **synthetic** (no real customer/payment data, no real payment APIs).
- The complaint amount is the strongest matching signal; timestamps/types disambiguate secondarily.
- `agent_summary` and `recommended_next_action` are internal agent-facing text and are kept in English;
  `customer_reply` mirrors the input language (Bangla in → Bangla out).
- "Established recipient pattern" = ≥2 transfers to the same counterparty in history (contradicts a
  wrong-transfer claim → `inconsistent`).

## Known limitations

- Rule-based extraction may miss exotic phrasings or amounts written purely in Bangla **words** (digits,
  both Latin and Bangla numerals, are handled). Such cases degrade safely to `insufficient_data` rather
  than a wrong guess.
- Time references ("yesterday", "2pm") are used only weakly; amount + counterparty drive matching.
- `mixed` (Banglish) replies are returned in English for clarity.
- The optional LLM path depends on the operator's own API key/quota; with no key the service is fully
  functional in deterministic mode.

## Repository layout

```
src/        server, validation, extraction, matching, classification, reply, safety, optional LLM
test/       node:test suites (samples, safety, HTTP) + live smoke script
scripts/    sample_output.json generator
docs/       PROJECT_SPEC, CONTEXT, DECISIONS, TRACKING, TEST_MATRIX
Dockerfile  node:20-slim image (<500MB)
```
