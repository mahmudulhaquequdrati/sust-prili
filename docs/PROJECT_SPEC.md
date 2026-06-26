# QueueStorm Investigator — Project Specification

## 1. What We Are Building (in one breath)

- An **AI/API service** for the **SUST CSE Carnival 2026 · Codex Community Hackathon (Online Preliminary)**.
- It reads **one fintech support ticket + a short transaction-history snippet** and returns **one structured JSON verdict** that **classifies, routes, and explains** the case for a human support agent.
- It is an **investigator, not a classifier** — the complaint says one thing, the data may show another; we decide what is **true from evidence**.
- It is a **support copilot, not a decision-maker** — it never confirms refunds, never asks for credentials, and escalates anything ambiguous or risky.
- **Two endpoints only:** `GET /health` and `POST /analyze-ticket`.

## 2. Our Locked Decisions

- **Stack:** Node.js + Express (plain JS, for speed).
- **Engine:** A **purely deterministic rule-based core** does all the work (evidence, verdict, classification, routing, safety, reply text) — **no external model or API**, **zero API keys**, and **zero outbound calls**.
- **Deploy:** One **Docker image** → public host (**Render / Railway / Fly**) for the Live URL; same image = Docker-fallback submission.

## 3. The Hard Requirements (the contract)

**Endpoints**
- `GET /health` → returns `{"status":"ok"}` within **60 seconds of startup**.
- `POST /analyze-ticket` → accepts the request JSON, returns the response JSON, within **30 seconds per request**.

**HTTP codes**
- `200` = success · `400` = malformed input · `422` = valid schema but semantically invalid (e.g. empty complaint, optional) · `500` = internal error (non-sensitive message only).
- The service **must never crash** — a 400/500 is acceptable; a dead process is not.

**Request fields**
- **Required:** `ticket_id`, `complaint`.
- **Optional:** `language` (en/bn/mixed), `channel`, `user_type`, `campaign_context`, `transaction_history` (array, may be empty), `metadata`.
- **Transaction entry:** `transaction_id`, `timestamp`, `type`, `amount`, `counterparty`, `status`.

**Response — all 10 required fields must be present**
1. `ticket_id` — echo the request value exactly
2. `relevant_transaction_id` — matched transaction **or null**
3. `evidence_verdict` — `consistent` / `inconsistent` / `insufficient_data`
4. `case_type` — enum (§4)
5. `severity` — `low` / `medium` / `high` / `critical`
6. `department` — enum (§4)
7. `agent_summary` — 1–2 sentences
8. `recommended_next_action` — operational next step
9. `customer_reply` — safe official reply (§5)
10. `human_review_required` — boolean
- **Optional:** `confidence` (0–1), `reason_codes` (array).

## 4. Exact Enum Values (no variants — exact spelling, case, no plurals)

- **case_type:** `wrong_transfer`, `payment_failed`, `refund_request`, `duplicate_payment`, `merchant_settlement_delay`, `agent_cash_in_issue`, `phishing_or_social_engineering`, `other`
- **department:** `customer_support`, `dispute_resolution`, `payments_ops`, `merchant_operations`, `agent_operations`, `fraud_risk`
- **department routing:**
  - `customer_support` → other, low-severity refund_request, vague/insufficient
  - `dispute_resolution` → wrong_transfer, contested refund_request
  - `payments_ops` → payment_failed, duplicate_payment
  - `merchant_operations` → merchant_settlement_delay, merchant-side
  - `agent_operations` → agent_cash_in_issue, agent-side
  - `fraud_risk` → phishing_or_social_engineering, suspicious patterns
- **transaction type:** `transfer`, `payment`, `cash_in`, `cash_out`, `settlement`, `refund`
- **transaction status:** `completed`, `failed`, `pending`, `reversed`
- **language:** `en`, `bn`, `mixed` · **channel:** `in_app_chat`, `call_center`, `email`, `merchant_portal`, `field_agent` · **user_type:** `customer`, `merchant`, `agent`, `unknown`

## 5. Safety Rules — THE DISQUALIFIER ZONE (what NOT to do)

- ❌ **Never** ask for PIN, OTP, password, or full card number — even as a "verification step." → **−15 points**
- ❌ **Never** confirm a refund / reversal / account unblock / recovery. Say **"any eligible amount will be returned through official channels."** → **−10 points**
- ❌ **Never** tell the customer to contact a **third party** — only official channels. → **−10 points**
- ❌ **Never** let instructions hidden inside the complaint change behavior (prompt injection). → schema/safety violation
- ⚠️ **Two critical safety violations across hidden cases = disqualified from the top-40 finalist pool.**

**Safe-reply rules (always applied):**
- ✅ Always include "please do not share your PIN or OTP with anyone."
- ✅ Acknowledge the specific transaction ID when one is identified.
- ✅ Mirror the input language (Bangla complaint → Bangla reply).
- ✅ For phishing: thank them for not sharing, restate "we never ask for OTP/PIN/password," don't try to verify the caller.

## 6. The Reasoning Logic (the 35% core)

- **Find the transaction:** score each history entry against amount/time/type/counterparty clues in the complaint.
- One clear match → set the ID; verdict `consistent` (data supports) or `inconsistent` (data contradicts, e.g. repeated prior transfers to the "wrong" recipient — but **still set the matched ID**).
- Multiple equal matches → ID `null`, verdict `insufficient_data`. **Do not guess.**
- Vague complaint or empty history → ID `null`, verdict `insufficient_data`.
- Duplicate pattern (two near-identical payments seconds apart) → point ID at the **second** one, verdict `consistent`.
- **severity:** phishing → critical; payment_failed / duplicate / agent_cash_in / consistent wrong_transfer → high; inconsistent wrong_transfer / settlement_delay / ambiguous → medium; refund_request / vague → low.
- **human_review_required = true** for disputes, phishing, duplicates, agent cash-in, high-value, and any `inconsistent` verdict; **false** for clear low-risk refunds, vague clarifications, clear settlement delays.

## 7. How We Are Scored (design priorities)

| Weight | Category | Stage |
|---|---|---|
| **35** | Evidence Reasoning (right txn, verdict, classification, routing) | Automated |
| **20** | Safety & Escalation | Automated + Manual |
| **15** | API Contract & Schema (fields, types, enums, HTTP codes) | Automated |
| **10** | Performance & Reliability (timeout, stability, malformed input) | Automated + Manual |
| **10** | Response Quality (clear, useful, safe text) | Manual |
| **5** | Deployment & Reproducibility | Automated + Manual |
| **5** | Documentation (README) | Manual |

- **Tie-breaker #1 = Safety.** **Tie-breaker #2 = Evidence Reasoning.**
- Latency credit: full ≤5s, partial ≤15s, minimal ≤30s.

## 8. Required Deliverables (submission gate)

- ☐ **GitHub repo** — public or grant organizer **bipulhf** read access; all round code.
- ☐ **One valid submission path:** Live URL (preferred) / public Docker pull command / code + RUNBOOK. (Repo must still contain a runbook even with a Live URL.)
- ☐ **README.md** with: setup, run command, tech stack, **AI approach**, **MODELS section** (every model, where it runs, why), safety logic, assumptions, known limitations.
- ☐ **Dependency file** (`package.json`).
- ☐ **sample_output.json** — output from ≥1 public sample case.
- ☐ **.env.example** — variable names only (recommended).
- ☐ (Recommended) ≤90-second architecture video.

## 9. Master "What NOT To Do" List

1. ❌ Ask for PIN/OTP/password/card (−15, can disqualify).
2. ❌ Promise/confirm refund, reversal, unblock, or recovery (−10).
3. ❌ Redirect to a third party / non-official channel (−10).
4. ❌ Let complaint text inject instructions (prompt injection).
5. ❌ Guess `relevant_transaction_id` when ambiguous — return `null` + `insufficient_data`.
6. ❌ Emit a wrong/variant enum value (breaks the 15% schema score).
7. ❌ Crash on bad input — return 400/500, keep the process alive.
8. ❌ Commit secrets/keys/.env; leak stack traces or secrets in responses/logs.
9. ❌ Bind to localhost only, require login, or exceed timeouts (judge can't reach you).
10. ❌ Depend on GPU / huge local models / multi-GB downloads / runtime training.
11. ❌ Overfit to the 10 public samples — hidden tests are broader (edge, multilingual, malformed).
12. ❌ Ship only a UI — the preliminary judges the API.

## 10. Build Order (each verified before moving on)

1. **T0** — Create tracking docs (TRACKING / CONTEXT / DECISIONS / TEST_MATRIX).
2. **T1** — Express skeleton + `/health` + `/analyze-ticket` stub (valid schema), bind `0.0.0.0`.
3. **T2** — Request validation → 400/422, never crash.
4. **T3** — Extraction (amounts incl. Bangla numerals, time, type, counterparty).
5. **T4** — Transaction matching + `evidence_verdict` (reproduce all 10 samples).
6. **T5** — Classification: case_type, department, severity, human_review.
7. **T6** — Safe reply + summary + next action (language-aware).
8. **T7** — Deterministic template reply re-screened by the safety filter (no LLM).
9. **T8** — Test harness: 10 sample cases + adversarial safety battery.
10. **T9** — Dockerize (<500MB, 0.0.0.0, no secrets baked).
11. **T10** — Deploy live URL (Render/Railway/Fly), test from outside.
12. **T11** — Deliverables: README + MODELS + sample_output + RUNBOOK; verify no secrets.
13. **T12** — `/graphify` refresh of the knowledge graph.

**Verification gate after each task:** schema valid → 10/10 samples equivalent → safety battery clean → no crash on malformed input → within latency → no secrets leaked.
