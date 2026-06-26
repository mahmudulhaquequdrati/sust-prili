# DECISIONS — Append-only log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Stack: Node.js + Express (plain JS)** | Ubiquitous, fast to iterate under 4.5h clock, native JSON, trivial Docker. |
| 2 | **Engine: deterministic rule-based core + optional LLM polish** | Safety (20%) & evidence (35%) must be deterministic and reproducible; organizers provide no API keys. LLM only rephrases the reply, never decides verdict/safety. |
| 3 | **Pure-rules fallback always present** | Service must score fully with zero keys / on LLM timeout or quota error. |
| 4 | **Deploy: one Docker image → Render/Railway/Fly** | Live URL (preferred path) + Docker-fallback path from a single artifact; <500MB, binds 0.0.0.0. |
| 5 | **Safety filter runs on EVERY reply, including LLM output** | LLM output is re-screened for PIN/OTP/refund-promise/third-party before returning. |
| 6 | **relevant_transaction_id = null when ambiguous** | Spec & samples 06/08 penalize guessing; null + insufficient_data is the correct investigator behavior. |
| 7 | **customer_reply mirrors input language** | Sample 07 returns Bangla for a Bangla complaint; language field + script detection drive this. |
| 8 | **No TypeScript** | Speed over type-safety for a one-round build; validation handled explicitly. |
| 9 | **LLM provider = DeepSeek only** (`DEEPSEEK_API_KEY`, OpenAI-compatible API, default `deepseek-v4-flash`) | Single, low-cost provider per CEO; OpenAI path removed to keep config simple. Still optional + off without a key. |
| 10 | **LLM output is evaluated, not trusted** (`evaluatePolishedReply`) | Beyond safety, the AI rewrite is rejected on hallucinated txn IDs, language drift, or excess length → deterministic reply used. Protects Evidence (35) + Safety (20) + Bangla tie-breaker. |
