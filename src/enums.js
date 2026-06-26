'use strict';

// Exact enum values from the problem statement (Section 7) and sample-case _meta.
// Any variant (case, plural, alternate spelling) is scored as a schema violation,
// so these are the single source of truth and must be used verbatim.

const CASE_TYPE = Object.freeze({
  WRONG_TRANSFER: 'wrong_transfer',
  PAYMENT_FAILED: 'payment_failed',
  REFUND_REQUEST: 'refund_request',
  DUPLICATE_PAYMENT: 'duplicate_payment',
  MERCHANT_SETTLEMENT_DELAY: 'merchant_settlement_delay',
  AGENT_CASH_IN_ISSUE: 'agent_cash_in_issue',
  PHISHING: 'phishing_or_social_engineering',
  OTHER: 'other',
});

const DEPARTMENT = Object.freeze({
  CUSTOMER_SUPPORT: 'customer_support',
  DISPUTE_RESOLUTION: 'dispute_resolution',
  PAYMENTS_OPS: 'payments_ops',
  MERCHANT_OPERATIONS: 'merchant_operations',
  AGENT_OPERATIONS: 'agent_operations',
  FRAUD_RISK: 'fraud_risk',
});

const VERDICT = Object.freeze({
  CONSISTENT: 'consistent',
  INCONSISTENT: 'inconsistent',
  INSUFFICIENT: 'insufficient_data',
});

const SEVERITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const TXN_TYPE = Object.freeze({
  TRANSFER: 'transfer',
  PAYMENT: 'payment',
  CASH_IN: 'cash_in',
  CASH_OUT: 'cash_out',
  SETTLEMENT: 'settlement',
  REFUND: 'refund',
});

const TXN_STATUS = Object.freeze(['completed', 'failed', 'pending', 'reversed']);
const LANGUAGE = Object.freeze(['en', 'bn', 'mixed']);
const CHANNEL = Object.freeze(['in_app_chat', 'call_center', 'email', 'merchant_portal', 'field_agent']);
const USER_TYPE = Object.freeze(['customer', 'merchant', 'agent', 'unknown']);

// Frozen value sets for validation / self-checks.
const VALID = Object.freeze({
  case_type: Object.freeze(Object.values(CASE_TYPE)),
  department: Object.freeze(Object.values(DEPARTMENT)),
  evidence_verdict: Object.freeze(Object.values(VERDICT)),
  severity: Object.freeze(Object.values(SEVERITY)),
});

module.exports = {
  CASE_TYPE,
  DEPARTMENT,
  VERDICT,
  SEVERITY,
  TXN_TYPE,
  TXN_STATUS,
  LANGUAGE,
  CHANNEL,
  USER_TYPE,
  VALID,
};
