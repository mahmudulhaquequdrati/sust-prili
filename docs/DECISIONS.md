# DECISIONS — Append-only log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Stack: Node.js + Express (plain JS)** | Ubiquitous, fast to iterate under 4.5h clock, native JSON, trivial Docker. |
| 2 | **Engine: deterministic rule-based core** *(was: + optional LLM polish — SUPERSEDED by #11)* | Safety (20%) & evidence (35%) must be deterministic and reproducible; organizers provide no API keys. The verdict, safety, and reply are all produced by deterministic rules. |
| 3 | **Pure rules are the only engine** *(originally framed as a "fallback" — SUPERSEDED by #11)* | Service scores fully with zero keys, zero outbound calls, and no quota/timeout dependency. |
| 4 | **Deploy: one Docker image → Render/Railway/Fly** | Live URL (preferred path) + Docker-fallback path from a single artifact; <500MB, binds 0.0.0.0. |
| 5 | **Safety filter runs on EVERY reply** *(was: "including LLM output" — SUPERSEDED by #11)* | Every reply is screened for PIN/OTP/refund-promise/third-party before returning. |
| 6 | **relevant_transaction_id = null when ambiguous** | Spec & samples 06/08 penalize guessing; null + insufficient_data is the correct investigator behavior. |
| 7 | **customer_reply mirrors input language** | Sample 07 returns Bangla for a Bangla complaint; language field + script detection drive this. |
| 8 | **No TypeScript** | Speed over type-safety for a one-round build; validation handled explicitly. |
| 9 | ~~**LLM provider = DeepSeek only**~~ — **SUPERSEDED by #11** | Historical: a single optional DeepSeek provider was once considered. The shipped system uses no LLM provider, no API key, and makes zero outbound calls. The problem spec *permits* external LLM providers; we use none (pure rules). |
| 10 | ~~**LLM output is evaluated, not trusted**~~ — **SUPERSEDED by #11** | Historical: when an optional AI rewrite existed it was re-validated (txn IDs, language, length) before use. With the LLM removed, the deterministic reply is the only reply, so this guard is no longer needed. |
| 11 | **Removed the optional LLM/DeepSeek entirely — pure deterministic rules** | Consistency across the many hidden judge cases (same input always yields the same verdict/reply); full <5 s latency credit with no model round-trip; no API quota or provider-downtime risk; and one consistent story end-to-end — live URL == README == code. The rubric states the task is solvable without paid APIs and encourages rule-based logic, so the LLM added risk without scoring upside. The service now reads only `PORT`, needs no API keys, and makes zero outbound calls. |
