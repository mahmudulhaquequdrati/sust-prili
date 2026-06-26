'use strict';

// safety.js — the hard guardrail. Every customer_reply (rules-generated OR
// LLM-polished) is screened here before it leaves the service. These checks
// mirror the scored Safety Rules (Section 8): never request credentials, never
// promise a refund/reversal/unblock, never redirect to a third party.

// Credential request: an imperative asking the customer to hand over a secret,
// WITHOUT a negation guarding it ("do not share your OTP" is safe).
const CRED_REQUEST = /\b(share|send|provide|give|tell|enter|type|confirm|verify|submit)\b[^.?!]{0,40}\b(pin|otp|password|cvv|card\s*number|full\s*card)\b/i;
const NEGATION_NEAR = /\b(do not|don'?t|never|not|won'?t|shouldn'?t|cannot|can'?t)\b/i;

// Promising a financial action the service has no authority to confirm.
const REFUND_PROMISE = /\b(we|i|our team)\b[^.?!]{0,40}\b(will\s+(refund|reverse|unblock|recover)|have\s+(refunded|reversed|unblocked|recovered)|refunded\s+you|reversed\s+your|unblocked\s+your)\b/i;
const REFUND_PROMISE_2 = /\b(your (refund|reversal) (has|is) (been )?(processed|approved|completed|done))\b/i;

// Redirecting to a suspicious/third-party channel: a phone number to call, a
// raw URL, or money-movement instructions. Transaction IDs like TXN-9101 are
// short digit runs and won't trip the phone pattern (requires 8+ digits).
const PHONE_IN_REPLY = /(?:\+?\d[\s-]?){8,}/;
const URL_IN_REPLY = /https?:\/\/|www\./i;
const THIRD_PARTY = /\b(western union|send money to|transfer to this|contact the police|call this number|outside official)\b/i;

const BANGLA = /[ঀ-৿]/;
const TXN_REF = /\bTXN[-_]?\d+/gi;

function screenReply(text) {
  const violations = [];
  if (typeof text !== 'string' || text.trim() === '') {
    return { safe: false, violations: ['empty_reply'] };
  }

  // Credential request — only a violation if not negated nearby.
  const credMatch = text.match(CRED_REQUEST);
  if (credMatch) {
    const start = Math.max(0, credMatch.index - 25);
    const window = text.slice(start, credMatch.index + credMatch[0].length);
    if (!NEGATION_NEAR.test(window)) violations.push('credential_request');
  }

  if (REFUND_PROMISE.test(text) || REFUND_PROMISE_2.test(text)) violations.push('unauthorized_promise');

  if (PHONE_IN_REPLY.test(text) || URL_IN_REPLY.test(text) || THIRD_PARTY.test(text)) {
    violations.push('third_party_redirect');
  }

  return { safe: violations.length === 0, violations };
}

// Evaluation gate for an LLM-polished reply. The rules reply is already correct;
// an LLM rewrite is ONLY accepted if it passes ALL of these checks, otherwise we
// keep the deterministic reply. This guards Evidence Reasoning, Safety, and
// Bangla/Banglish quality (rubric tie-breaker #6) against a stray model output.
function evaluatePolishedReply(polished, ctx) {
  const reasons = [];
  const { baseReply = '', relevantTransactionId = null } = ctx || {};

  if (typeof polished !== 'string' || polished.trim() === '') {
    return { accept: false, reasons: ['empty'] };
  }
  const text = polished.trim();

  // Length sanity — a reply should stay concise, never balloon.
  if (text.length > 1200) reasons.push('too_long');

  // Safety must hold for the rewritten text too.
  const screen = screenReply(text);
  if (!screen.safe) reasons.push(`unsafe:${screen.violations.join('|')}`);

  // No hallucinated transaction IDs: any TXN-xxx mentioned must equal the one we
  // actually identified. If we found none, the reply must not invent one.
  const ids = text.match(TXN_REF) || [];
  for (const raw of ids) {
    const norm = raw.toUpperCase().replace('_', '-');
    if (!relevantTransactionId || norm !== String(relevantTransactionId).toUpperCase()) {
      reasons.push('hallucinated_txn_id');
      break;
    }
  }

  // Language preservation (Bangla in -> Bangla out, English in -> English out).
  const baseBangla = BANGLA.test(baseReply);
  const polishedBangla = BANGLA.test(text);
  if (baseBangla && !polishedBangla) reasons.push('lost_bangla');
  if (!baseBangla && polishedBangla && !/[A-Za-z]/.test(text)) reasons.push('unexpected_language_switch');

  return { accept: reasons.length === 0, reasons };
}

module.exports = { screenReply, evaluatePolishedReply };
