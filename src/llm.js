'use strict';

// llm.js — OPTIONAL reply polish via DeepSeek. The deterministic rules engine
// produces a complete, safe answer on its own; this layer only rephrases
// customer_reply to read more naturally when DEEPSEEK_API_KEY is configured. It
// NEVER changes the verdict, classification, routing, or safety decisions.
//
// Hard guarantees:
//   - Off by default (no key -> returns null instantly, zero latency).
//   - Bounded by a timeout well under the 30s budget.
//   - Any error/timeout -> returns null, caller keeps the rules reply.
//   - The caller re-screens the output through safety.js before using it.

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 8000);

// Resolve the DeepSeek config. DeepSeek exposes an OpenAI-compatible
// POST {baseUrl}/chat/completions endpoint. Off unless DEEPSEEK_API_KEY is set.
//   - DEEPSEEK_API_KEY: the key (required to enable polishing)
//   - LLM_BASE_URL:     override base URL (default https://api.deepseek.com)
//   - MODEL_NAME:       override model (default deepseek-chat; deepseek-reasoner also valid)
function getConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  // base URL + model come from the environment (.env / compose / platform).
  // Trailing slashes are trimmed to avoid a `//chat/completions` URL.
  return {
    apiKey,
    baseUrl: (process.env.LLM_BASE_URL || '').replace(/\/$/, ''),
    model: process.env.MODEL_NAME,
  };
}

function isEnabled() {
  return getConfig() !== null;
}

const SYSTEM_PROMPT = [
  'You rewrite a fintech support reply to be clear, calm, and professional.',
  'STRICT RULES, never break them:',
  '- Never ask for or mention collecting PIN, OTP, password, or card number.',
  '- Never promise or confirm a refund, reversal, account unblock, or recovery. Use "any eligible amount will be returned through official channels".',
  '- Never tell the customer to contact a third party or any non-official channel.',
  '- Keep the same language as the input reply (Bangla stays Bangla, English stays English).',
  '- Keep it to 1-3 sentences. Do not invent transaction details. Preserve the meaning exactly.',
  'Output ONLY the rewritten reply text, nothing else.',
].join('\n');

async function polishReply(baseReply) {
  const cfg = getConfig();
  if (!cfg) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        max_tokens: 250,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Rewrite this reply, keeping all rules:\n\n${baseReply}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch (_err) {
    return null; // timeout, network, quota, parse — fall back to rules reply
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { polishReply, isEnabled };
