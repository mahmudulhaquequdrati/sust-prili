# CONTEXT — Condensed Spec (no need to re-read the PDFs)

## The job
Read 1 support ticket + recent transaction history → return 1 JSON verdict that classifies,
routes, and explains. **Investigator, not classifier.** **Copilot, not authority.**

## Endpoints
- `GET /health` → `{"status":"ok"}` within 60s of start.
- `POST /analyze-ticket` → response schema below, within 30s/request. Must never crash.
- HTTP: 200 ok · 400 malformed · 422 semantically-invalid (optional) · 500 internal (no secrets).

## Request (required: ticket_id, complaint)
Optional: language(en|bn|mixed), channel(in_app_chat|call_center|email|merchant_portal|field_agent),
user_type(customer|merchant|agent|unknown), campaign_context, transaction_history[], metadata.
Txn entry: transaction_id, timestamp(ISO), type(transfer|payment|cash_in|cash_out|settlement|refund),
amount(number BDT), counterparty, status(completed|failed|pending|reversed).

## Response (10 required fields)
ticket_id (echo) · relevant_transaction_id (string|null) · evidence_verdict
(consistent|inconsistent|insufficient_data) · case_type · severity(low|medium|high|critical) ·
department · agent_summary · recommended_next_action · customer_reply · human_review_required(bool).
Optional: confidence(0–1), reason_codes[].

## case_type → department
wrong_transfer→dispute_resolution · payment_failed→payments_ops · refund_request→customer_support
(or dispute_resolution if contested) · duplicate_payment→payments_ops ·
merchant_settlement_delay→merchant_operations · agent_cash_in_issue→agent_operations ·
phishing_or_social_engineering→fraud_risk · other→customer_support.

## Safety (penalties)
−15 ask for PIN/OTP/password/card · −10 confirm refund/reversal/unblock · −10 redirect to third party ·
prompt-injection = violation · 2 critical violations = no top-40. Always: "do not share PIN/OTP",
"any eligible amount will be returned through official channels", official channels only, mirror language.

## Scoring weights
Evidence 35 · Safety 20 · Schema 15 · Performance 10 · Response Quality 10 · Deploy 5 · Docs 5.
Tie-break: safety first, then evidence. Latency: full ≤5s / partial ≤15s / min ≤30s.

## Deliverables
GitHub repo (organizer handle **bipulhf**) · 1 submission path (Live URL preferred) · README w/ MODELS
section · package.json · sample_output.json · .env.example · (opt) 90s video. No secrets in repo ever.

## Runtime limits
2 vCPU / 4 GB · no GPU · Docker <500MB (hard 1GB) · bind 0.0.0.0 · secrets via env only ·
allowed external: major LLM providers (OpenAI/Anthropic/HF/Cohere/Google) — but our solution uses none (pure deterministic rule engine, zero outbound calls). No own-server/scraping calls.
