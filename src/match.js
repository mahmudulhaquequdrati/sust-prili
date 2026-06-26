'use strict';

// match.js — the investigator core. Given the complaint signals and the
// transaction history, decide which transaction the complaint refers to
// (relevant_transaction_id) and whether the evidence supports the claim
// (evidence_verdict). The guiding rule: never guess. When evidence is
// ambiguous or absent, return null + insufficient_data.

const { VERDICT, CASE_TYPE, TXN_TYPE } = require('./enums');

function txnTime(t) {
  const ms = new Date(t.timestamp).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function latest(txns) {
  return txns.slice().sort((a, b) => txnTime(b) - txnTime(a))[0];
}

// Count transfers in history to a given counterparty — an established-recipient
// pattern contradicts a "wrong transfer" claim.
function transfersToCounterparty(history, counterparty) {
  return history.filter((t) => t.counterparty === counterparty && t.type === TXN_TYPE.TRANSFER).length;
}

function result(id, verdict, confidence, matchedAmount) {
  return {
    relevant_transaction_id: id,
    evidence_verdict: verdict,
    confidence,
    matchedAmount: matchedAmount ?? null,
  };
}

function matchTransaction(signals, history, caseType) {
  const h = Array.isArray(history) ? history : [];

  // Phishing / safety reports and empty histories: nothing to match against.
  if (h.length === 0) {
    const conf = caseType === CASE_TYPE.PHISHING ? 0.95 : 0.6;
    return result(null, VERDICT.INSUFFICIENT, conf);
  }

  const amounts = signals.amounts;

  // Duplicate charge: point at the suspected duplicate (the later of the pair).
  if (caseType === CASE_TYPE.DUPLICATE_PAYMENT) {
    const groups = new Map();
    for (const t of h) {
      const key = `${Number(t.amount)}|${t.counterparty}|${t.type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    let best = null;
    for (const group of groups.values()) {
      if (group.length >= 2 && (amounts.length === 0 || amounts.includes(Number(group[0].amount)))) {
        if (!best || Number(group[0].amount) >= Number(best[0].amount)) best = group;
      }
    }
    if (best) {
      const dup = latest(best); // the second/later charge is the suspected duplicate
      return result(dup.transaction_id, VERDICT.CONSISTENT, 0.93, Number(dup.amount));
    }
    // Fall through to generic matching if no clean duplicate group found.
  }

  // Candidate set by amount match (strongest signal).
  let candidates = amounts.length ? h.filter((t) => amounts.includes(Number(t.amount))) : [];

  // No amount in the complaint: try a unique transaction-type match, else give up.
  if (candidates.length === 0 && amounts.length === 0) {
    const typed = h.filter((t) => signals.typeHints.has(t.type));
    if (typed.length === 1) {
      candidates = typed;
    } else {
      return result(null, VERDICT.INSUFFICIENT, 0.6); // vague complaint (e.g. SAMPLE-06)
    }
  }

  // Amount mentioned but nothing matches: cannot confirm against the data.
  if (candidates.length === 0) {
    return result(null, VERDICT.INSUFFICIENT, 0.6);
  }

  // Multiple plausible matches.
  if (candidates.length > 1) {
    const distinctCounterparties = new Set(candidates.map((t) => t.counterparty));
    if (distinctCounterparties.size > 1) {
      // Genuinely ambiguous — different recipients (e.g. SAMPLE-08). Do not guess.
      return result(null, VERDICT.INSUFFICIENT, 0.65, Number(candidates[0].amount));
    }
    // Same recipient repeated: take the most recent as the referenced transaction.
    candidates = [latest(candidates)];
  }

  const matched = candidates[0];

  // Evidence verdict. For a "wrong transfer" claim, an established history of
  // transfers to the same counterparty contradicts the claim (e.g. SAMPLE-02).
  let verdict = VERDICT.CONSISTENT;
  let confidence = 0.9;
  if (caseType === CASE_TYPE.WRONG_TRANSFER && transfersToCounterparty(h, matched.counterparty) >= 2) {
    verdict = VERDICT.INCONSISTENT;
    confidence = 0.75;
  }

  return result(matched.transaction_id, verdict, confidence, Number(matched.amount));
}

module.exports = { matchTransaction, transfersToCounterparty };
