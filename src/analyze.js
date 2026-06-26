'use strict';

// analyze.js — orchestrates the full pipeline for one ticket:
//   validate(normalized) -> extract -> classify -> match -> route -> reply
//   -> optional LLM polish -> safety screen -> assemble response.
// Always returns a complete, schema-valid response object. Any unexpected
// internal error degrades to a safe, generic-but-valid answer (never throws).

const { extractSignals } = require('./extract');
const { classifyCaseType, route } = require('./classify');
const { matchTransaction } = require('./match');
const { buildReply } = require('./reply');
const { screenReply, evaluatePolishedReply } = require('./safety');
const { polishReply, isEnabled } = require('./llm');
const { VALID, CASE_TYPE, DEPARTMENT, VERDICT, SEVERITY } = require('./enums');

const SAFE_FALLBACK_REPLY =
  'Thank you for reaching out. Our support team will review your request and contact you through official support channels. Please do not share your PIN or OTP with anyone.';

// Guarantee every enum field is a legal value (defensive schema protection).
function coerceEnums(out) {
  if (!VALID.case_type.includes(out.case_type)) out.case_type = CASE_TYPE.OTHER;
  if (!VALID.department.includes(out.department)) out.department = DEPARTMENT.CUSTOMER_SUPPORT;
  if (!VALID.evidence_verdict.includes(out.evidence_verdict)) out.evidence_verdict = VERDICT.INSUFFICIENT;
  if (!VALID.severity.includes(out.severity)) out.severity = SEVERITY.LOW;
  return out;
}

async function analyzeTicket(input) {
  const ticketId = input && typeof input.ticket_id === 'string' ? input.ticket_id : '';
  try {
    const history = Array.isArray(input.transaction_history) ? input.transaction_history : [];
    const signals = extractSignals(input.complaint, input.language);

    const caseType = classifyCaseType(signals, history);
    const match = matchTransaction(signals, history, caseType);
    const routing = route(caseType, match, signals);
    const reply = buildReply(caseType, match, signals);

    // Optional LLM polish (best-effort). The rewrite is evaluated for safety,
    // transaction-ID fidelity, and language preservation; only accepted if it
    // passes every check, otherwise we keep the deterministic reply.
    let customerReply = reply.customer_reply;
    if (isEnabled()) {
      const polished = await polishReply(customerReply);
      const verdict = evaluatePolishedReply(polished, {
        baseReply: customerReply,
        relevantTransactionId: match.relevant_transaction_id,
        language: signals.language,
      });
      if (verdict.accept) customerReply = polished.trim();
    }

    // Final safety net: the rules reply is safe by construction, but never ship
    // an unsafe customer_reply under any circumstance.
    if (!screenReply(customerReply).safe) customerReply = SAFE_FALLBACK_REPLY;

    const response = coerceEnums({
      ticket_id: ticketId,
      relevant_transaction_id: match.relevant_transaction_id,
      evidence_verdict: match.evidence_verdict,
      case_type: caseType,
      severity: routing.severity,
      department: routing.department,
      agent_summary: reply.agent_summary,
      recommended_next_action: reply.recommended_next_action,
      customer_reply: customerReply,
      human_review_required: routing.human_review_required,
      confidence: Number(match.confidence?.toFixed ? match.confidence.toFixed(2) : match.confidence) || 0.6,
      reason_codes: reply.reason_codes,
    });

    return response;
  } catch (_err) {
    // Degrade gracefully to a valid, safe response rather than 500-ing.
    return {
      ticket_id: ticketId,
      relevant_transaction_id: null,
      evidence_verdict: VERDICT.INSUFFICIENT,
      case_type: CASE_TYPE.OTHER,
      severity: SEVERITY.LOW,
      department: DEPARTMENT.CUSTOMER_SUPPORT,
      agent_summary: 'Unable to fully analyze this ticket automatically; routing to support for manual review.',
      recommended_next_action: 'Have a support agent review the ticket details manually.',
      customer_reply: SAFE_FALLBACK_REPLY,
      human_review_required: true,
      confidence: 0.3,
      reason_codes: ['analysis_fallback'],
    };
  }
}

module.exports = { analyzeTicket };
