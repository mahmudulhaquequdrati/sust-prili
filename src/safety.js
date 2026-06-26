'use strict';

// safety.js — the hard guardrail. Every customer_reply is screened here before
// it leaves the service. These checks mirror the scored Safety Rules (Section 8):
// never request credentials, never promise a refund/reversal/unblock, never
// redirect to a third party.

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

module.exports = { screenReply };
