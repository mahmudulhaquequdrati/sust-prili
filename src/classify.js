'use strict';

// classify.js — case_type classification + routing (department, severity,
// human_review_required). Deterministic priority rules derived from the
// taxonomy (Section 7) and validated against all 10 public sample cases.

const { CASE_TYPE, DEPARTMENT, SEVERITY, VERDICT, TXN_TYPE } = require('./enums');

const HIGH_VALUE_THRESHOLD = 50000; // BDT; bumps severity for very large amounts.

// True when the history contains two near-identical payments (same amount,
// counterparty, type) close together in time — the duplicate-charge fingerprint.
function hasDuplicatePattern(history) {
  const groups = new Map();
  for (const t of history) {
    const key = `${Number(t.amount)}|${t.counterparty}|${t.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const times = group
      .map((t) => new Date(t.timestamp).getTime())
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (times.length >= 2 && times[times.length - 1] - times[0] <= 5 * 60 * 1000) return true;
    // Same amount+counterparty+type repeated is itself a strong duplicate signal.
    if (times.length < 2 && group.length >= 2) return true;
  }
  return false;
}

function historyHasStatus(history, status) {
  return history.some((t) => t.status === status);
}

// Determine case_type using a fixed priority order so stronger/safety-critical
// signals win over generic ones (e.g. a failed+deducted payment that also says
// "refund" is payment_failed, not refund_request).
function classifyCaseType(signals, history) {
  const h = Array.isArray(history) ? history : [];

  if (signals.phishingSignal) return CASE_TYPE.PHISHING;

  if (signals.duplicateSignal || hasDuplicatePattern(h)) return CASE_TYPE.DUPLICATE_PAYMENT;

  if (signals.failedSignal || (historyHasStatus(h, 'failed') && /deduct|balance|charged|কেটে|ব্যালেন্স/.test(signals.lower))) {
    return CASE_TYPE.PAYMENT_FAILED;
  }

  if ((signals.cashInSignal && signals.agentSignal) ||
      (h.some((t) => t.type === TXN_TYPE.CASH_IN && (t.status === 'pending' || t.status === 'failed')) && signals.notReceivedSignal)) {
    return CASE_TYPE.AGENT_CASH_IN_ISSUE;
  }

  if (signals.settlementSignal || (signals.merchantSignal && h.some((t) => t.type === TXN_TYPE.SETTLEMENT))) {
    return CASE_TYPE.MERCHANT_SETTLEMENT_DELAY;
  }

  if (signals.wrongTransferSignal ||
      ((signals.typeHints.has(TXN_TYPE.TRANSFER) || h.some((t) => t.type === TXN_TYPE.TRANSFER)) && signals.notReceivedSignal)) {
    return CASE_TYPE.WRONG_TRANSFER;
  }

  if (signals.refundSignal) return CASE_TYPE.REFUND_REQUEST;

  return CASE_TYPE.OTHER;
}

// Map case_type -> department, with a couple of evidence-aware nuances.
function routeDepartment(caseType, match) {
  switch (caseType) {
    case CASE_TYPE.PHISHING: return DEPARTMENT.FRAUD_RISK;
    case CASE_TYPE.PAYMENT_FAILED:
    case CASE_TYPE.DUPLICATE_PAYMENT: return DEPARTMENT.PAYMENTS_OPS;
    case CASE_TYPE.AGENT_CASH_IN_ISSUE: return DEPARTMENT.AGENT_OPERATIONS;
    case CASE_TYPE.MERCHANT_SETTLEMENT_DELAY: return DEPARTMENT.MERCHANT_OPERATIONS;
    case CASE_TYPE.WRONG_TRANSFER: return DEPARTMENT.DISPUTE_RESOLUTION;
    case CASE_TYPE.REFUND_REQUEST:
      // A contested refund (evidence contradicts) escalates to dispute resolution.
      return match.evidence_verdict === VERDICT.INCONSISTENT ? DEPARTMENT.DISPUTE_RESOLUTION : DEPARTMENT.CUSTOMER_SUPPORT;
    case CASE_TYPE.OTHER:
    default: return DEPARTMENT.CUSTOMER_SUPPORT;
  }
}

function computeSeverity(caseType, match, maxAmount) {
  let severity;
  switch (caseType) {
    case CASE_TYPE.PHISHING: severity = SEVERITY.CRITICAL; break;
    case CASE_TYPE.PAYMENT_FAILED:
    case CASE_TYPE.DUPLICATE_PAYMENT:
    case CASE_TYPE.AGENT_CASH_IN_ISSUE: severity = SEVERITY.HIGH; break;
    case CASE_TYPE.WRONG_TRANSFER:
      severity = match.evidence_verdict === VERDICT.CONSISTENT ? SEVERITY.HIGH : SEVERITY.MEDIUM; break;
    case CASE_TYPE.MERCHANT_SETTLEMENT_DELAY: severity = SEVERITY.MEDIUM; break;
    case CASE_TYPE.REFUND_REQUEST:
    case CASE_TYPE.OTHER:
    default: severity = SEVERITY.LOW; break;
  }
  // Optional high-value bump (never lowers, never exceeds critical).
  if (maxAmount >= HIGH_VALUE_THRESHOLD) {
    if (severity === SEVERITY.LOW) severity = SEVERITY.MEDIUM;
    else if (severity === SEVERITY.MEDIUM) severity = SEVERITY.HIGH;
  }
  return severity;
}

function needsHumanReview(caseType, match, severity) {
  if (caseType === CASE_TYPE.PHISHING) return true;
  if (caseType === CASE_TYPE.DUPLICATE_PAYMENT) return true;
  if (caseType === CASE_TYPE.AGENT_CASH_IN_ISSUE) return true;
  if (caseType === CASE_TYPE.WRONG_TRANSFER && match.relevant_transaction_id !== null) return true;
  if (match.evidence_verdict === VERDICT.INCONSISTENT) return true;
  if (severity === SEVERITY.CRITICAL) return true;
  return false;
}

// Combine the routing decisions into one object.
function route(caseType, match, signals) {
  const maxAmount = signals.amounts.length ? Math.max(...signals.amounts) : 0;
  const department = routeDepartment(caseType, match);
  const severity = computeSeverity(caseType, match, maxAmount);
  const human_review_required = needsHumanReview(caseType, match, severity);
  return { department, severity, human_review_required };
}

module.exports = { classifyCaseType, route, hasDuplicatePattern };
