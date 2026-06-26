'use strict';

// reply.js — generates the agent-facing text (agent_summary,
// recommended_next_action, reason_codes) and the customer-facing customer_reply.
// agent_summary and recommended_next_action are always English (internal ops
// text, as in the samples). customer_reply mirrors the input language.
// Every template is safe by construction; safety.js double-checks the output.

const { CASE_TYPE, VERDICT } = require('./enums');

const PIN_LINE_EN = 'Please do not share your PIN or OTP with anyone.';
const PIN_LINE_BN = 'অনুগ্রহ করে কারো সাথে আপনার পিন বা ওটিপি শেয়ার করবেন না।';
const OFFICIAL_EN = 'official support channels';

function amtStr(match, signals) {
  const amt = match.matchedAmount ?? (signals.amounts.length ? signals.amounts[0] : null);
  return amt != null ? `${amt} BDT` : 'the reported amount';
}

function idStr(match) {
  return match.relevant_transaction_id || 'the transaction';
}

// ---- agent_summary (English) -------------------------------------------------
function buildSummary(caseType, match, signals) {
  const id = idStr(match);
  const amt = amtStr(match, signals);
  const v = match.evidence_verdict;
  switch (caseType) {
    case CASE_TYPE.WRONG_TRANSFER:
      if (match.relevant_transaction_id === null) {
        return `Customer reports a ${amt} transfer was not received, but multiple transactions match and the correct one cannot be determined from the provided history.`;
      }
      if (v === VERDICT.INCONSISTENT) {
        return `Customer claims ${id} (${amt}) was a wrong transfer, but the history shows prior transfers to the same recipient, suggesting an established payee.`;
      }
      return `Customer reports sending ${amt} via ${id} to a recipient they now believe was incorrect. Requires dispute review.`;
    case CASE_TYPE.PAYMENT_FAILED:
      return `Customer attempted a ${amt} payment (${id}) that failed but reports the balance was deducted. Requires payments operations investigation.`;
    case CASE_TYPE.REFUND_REQUEST:
      return `Customer requests a refund of ${amt} for ${id} (merchant payment). Not a service failure.`;
    case CASE_TYPE.DUPLICATE_PAYMENT:
      return `Customer reports a duplicate payment. Two ${amt} charges appear in the history; ${id} is the suspected duplicate.`;
    case CASE_TYPE.MERCHANT_SETTLEMENT_DELAY:
      return `Merchant reports ${amt} settlement (${id}) is delayed beyond the expected window. Settlement status is pending.`;
    case CASE_TYPE.AGENT_CASH_IN_ISSUE:
      return `Customer reports ${amt} cash-in via agent (${id}) is not reflected in their balance.`;
    case CASE_TYPE.PHISHING:
      return `Customer reports an unsolicited contact requesting credentials (OTP/PIN/password). Likely social engineering; customer advised not to share.`;
    case CASE_TYPE.OTHER:
    default:
      return `Customer raised a concern without enough detail to identify a specific transaction. Needs clarification before any action.`;
  }
}

// ---- recommended_next_action (English) --------------------------------------
function buildNextAction(caseType, match) {
  const id = idStr(match);
  const v = match.evidence_verdict;
  switch (caseType) {
    case CASE_TYPE.WRONG_TRANSFER:
      if (match.relevant_transaction_id === null) {
        return `Ask the customer for the recipient's number to identify the correct transaction. Do not initiate a dispute until the transaction is confirmed.`;
      }
      if (v === VERDICT.INCONSISTENT) {
        return `Flag for human review. Verify with the customer whether this was genuinely a wrong transfer given the established pattern with this recipient.`;
      }
      return `Verify ${id} details with the customer and initiate the wrong-transfer dispute workflow per policy.`;
    case CASE_TYPE.PAYMENT_FAILED:
      return `Investigate ${id} ledger status. If the balance was deducted on a failed payment, initiate the reversal flow within standard SLA.`;
    case CASE_TYPE.REFUND_REQUEST:
      return `Inform the customer that refund eligibility depends on the merchant's policy, and guide them to contact the merchant through official means.`;
    case CASE_TYPE.DUPLICATE_PAYMENT:
      return `Verify the duplicate with payments operations. If the biller confirms only one payment was received, initiate reversal of ${id}.`;
    case CASE_TYPE.MERCHANT_SETTLEMENT_DELAY:
      return `Route to merchant operations to verify the settlement batch status. If delayed, communicate a revised ETA to the merchant.`;
    case CASE_TYPE.AGENT_CASH_IN_ISSUE:
      return `Investigate the pending cash-in ${id} with agent operations. Confirm the settlement state and resolve within the standard cash-in SLA.`;
    case CASE_TYPE.PHISHING:
      return `Escalate to the fraud_risk team immediately. Confirm to the customer that the company never asks for OTP/PIN, and log the reported contact for fraud pattern analysis.`;
    case CASE_TYPE.OTHER:
    default:
      return `Reply to the customer requesting the transaction ID, the amount involved, and a short description of what went wrong.`;
  }
}

// ---- customer_reply (language-aware) ----------------------------------------
function buildCustomerReply(caseType, match, signals) {
  const bn = signals.language === 'bn';
  const id = idStr(match);
  const amt = amtStr(match, signals);

  if (caseType === CASE_TYPE.PHISHING) {
    return bn
      ? `কোনো তথ্য শেয়ার করার আগে যোগাযোগ করার জন্য ধন্যবাদ। আমরা কখনোই আপনার পিন, ওটিপি বা পাসওয়ার্ড চাই না। কেউ নিজেকে আমাদের প্রতিনিধি দাবি করলেও এগুলো শেয়ার করবেন না। আমাদের ফ্রড টিমকে বিষয়টি জানানো হয়েছে।`
      : `Thank you for reaching out before sharing any information. We never ask for your PIN, OTP, or password under any circumstances. Please do not share these with anyone, even if they claim to be from us. Our fraud team has been notified of this incident.`;
  }

  if (caseType === CASE_TYPE.WRONG_TRANSFER && match.relevant_transaction_id === null) {
    return bn
      ? `আপনার অনুরোধের জন্য ধন্যবাদ। ঐ সময়ের আশেপাশে একাধিক ${amt} লেনদেন দেখা যাচ্ছে। সঠিক লেনদেনটি শনাক্ত করতে অনুগ্রহ করে প্রাপকের নম্বরটি জানান। ${PIN_LINE_BN}`
      : `Thank you for reaching out. We see multiple transactions of ${amt} around that time. Could you share the recipient's number so we can identify the right transaction? ${PIN_LINE_EN}`;
  }

  switch (caseType) {
    case CASE_TYPE.WRONG_TRANSFER:
      return bn
        ? `আপনার লেনদেন ${id} এর বিষয়ে আমরা অবগত হয়েছি। আমাদের ডিসপিউট টিম বিষয়টি পর্যালোচনা করে অফিসিয়াল চ্যানেলে আপনার সাথে যোগাযোগ করবে। ${PIN_LINE_BN}`
        : `We have noted your concern about transaction ${id}. ${PIN_LINE_EN} Our dispute team will review the case and contact you through ${OFFICIAL_EN}.`;
    case CASE_TYPE.PAYMENT_FAILED:
      return bn
        ? `লেনদেন ${id} এর কারণে আপনার ব্যালেন্স থেকে অপ্রত্যাশিতভাবে টাকা কেটে যেতে পারে বলে আমরা অবগত হয়েছি। আমাদের পেমেন্টস টিম বিষয়টি যাচাই করবে এবং প্রযোজ্য কোনো অর্থ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে। ${PIN_LINE_BN}`
        : `We have noted that transaction ${id} may have caused an unexpected balance deduction. Our payments team will review the case and any eligible amount will be returned through ${OFFICIAL_EN}. ${PIN_LINE_EN}`;
    case CASE_TYPE.REFUND_REQUEST:
      return bn
        ? `যোগাযোগ করার জন্য ধন্যবাদ। সম্পন্ন হওয়া মার্চেন্ট পেমেন্টের রিফান্ড মার্চেন্টের নিজস্ব নীতির উপর নির্ভর করে। আমরা সরাসরি মার্চেন্টের সাথে যোগাযোগের পরামর্শ দিচ্ছি, প্রয়োজনে আমরা সহায়তা করতে পারি। ${PIN_LINE_BN}`
        : `Thank you for reaching out. Refunds for completed merchant payments depend on the merchant's own policy. We recommend contacting the merchant directly, and we can guide you if needed. ${PIN_LINE_EN}`;
    case CASE_TYPE.DUPLICATE_PAYMENT:
      return bn
        ? `লেনদেন ${id} এর সম্ভাব্য ডুপ্লিকেট পেমেন্টের বিষয়ে আমরা অবগত হয়েছি। আমাদের পেমেন্টস টিম বিলারের সাথে যাচাই করবে এবং প্রযোজ্য কোনো অর্থ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে। ${PIN_LINE_BN}`
        : `We have noted the possible duplicate payment for transaction ${id}. Our payments team will verify with the biller and any eligible amount will be returned through ${OFFICIAL_EN}. ${PIN_LINE_EN}`;
    case CASE_TYPE.MERCHANT_SETTLEMENT_DELAY:
      return bn
        ? `আপনার সেটেলমেন্ট ${id} এর বিষয়ে আমরা অবগত হয়েছি। আমাদের মার্চেন্ট অপারেশন্স টিম ব্যাচের অবস্থা যাচাই করে অফিসিয়াল চ্যানেলে প্রত্যাশিত সময় জানাবে।`
        : `We have noted your concern about settlement ${id}. Our merchant operations team will check the batch status and update you on the expected settlement time through ${OFFICIAL_EN}.`;
    case CASE_TYPE.AGENT_CASH_IN_ISSUE:
      return bn
        ? `আপনার লেনদেন ${id} এর বিষয়ে আমরা অবগত হয়েছি। আমাদের এজেন্ট অপারেশন্স দল এটি দ্রুত যাচাই করবে এবং অফিসিয়াল চ্যানেলে আপনাকে জানাবে। ${PIN_LINE_BN}`
        : `We have noted your concern about transaction ${id}. Our agent operations team will verify it promptly and update you through ${OFFICIAL_EN}. ${PIN_LINE_EN}`;
    case CASE_TYPE.OTHER:
    default:
      return bn
        ? `যোগাযোগ করার জন্য ধন্যবাদ। দ্রুত সহায়তার জন্য অনুগ্রহ করে লেনদেন আইডি, টাকার পরিমাণ এবং সমস্যার সংক্ষিপ্ত বিবরণ জানান। ${PIN_LINE_BN}`
        : `Thank you for reaching out. To help you faster, please share the transaction ID, the amount involved, and a short description of what went wrong. ${PIN_LINE_EN}`;
  }
}

// ---- reason_codes ------------------------------------------------------------
function buildReasonCodes(caseType, match) {
  const v = match.evidence_verdict;
  switch (caseType) {
    case CASE_TYPE.WRONG_TRANSFER:
      if (match.relevant_transaction_id === null) return ['ambiguous_match', 'needs_clarification'];
      if (v === VERDICT.INCONSISTENT) return ['wrong_transfer_claim', 'established_recipient_pattern', 'evidence_inconsistent'];
      return ['wrong_transfer', 'transaction_match', 'dispute_initiated'];
    case CASE_TYPE.PAYMENT_FAILED: return ['payment_failed', 'potential_balance_deduction'];
    case CASE_TYPE.REFUND_REQUEST: return ['refund_request', 'merchant_policy_dependent'];
    case CASE_TYPE.DUPLICATE_PAYMENT: return ['duplicate_payment', 'biller_verification_required'];
    case CASE_TYPE.MERCHANT_SETTLEMENT_DELAY: return ['merchant_settlement', 'delay', 'pending'];
    case CASE_TYPE.AGENT_CASH_IN_ISSUE: return ['agent_cash_in', 'pending_transaction', 'agent_ops'];
    case CASE_TYPE.PHISHING: return ['phishing', 'credential_protection', 'critical_escalation'];
    case CASE_TYPE.OTHER:
    default: return ['vague_complaint', 'needs_clarification'];
  }
}

function buildReply(caseType, match, signals) {
  return {
    agent_summary: buildSummary(caseType, match, signals),
    recommended_next_action: buildNextAction(caseType, match),
    customer_reply: buildCustomerReply(caseType, match, signals),
    reason_codes: buildReasonCodes(caseType, match),
  };
}

module.exports = { buildReply, buildCustomerReply, buildSummary, buildNextAction, buildReasonCodes };
