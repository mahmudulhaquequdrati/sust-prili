'use strict';

// extract.js — deterministic signal extraction from the complaint text.
// No LLM here: matching/verdict must be reproducible. We pull out amounts
// (including Bangla numerals), transaction-type hints, and intent flags that
// the classifier and matcher consume.

const { TXN_TYPE } = require('./enums');

const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

function normalizeDigits(text) {
  return String(text).replace(/[০-৯]/g, (d) => BN_DIGITS[d] || d);
}

// Detect Bangla script presence (used when language is not provided).
function detectLanguage(text, declared) {
  if (declared === 'en' || declared === 'bn' || declared === 'mixed') return declared;
  const hasBangla = /[ঀ-৿]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasBangla && hasLatin) return 'mixed';
  if (hasBangla) return 'bn';
  return 'en';
}

// Pull plausible money amounts out of the text. We normalize Bangla numerals,
// strip thousands separators, and discard tokens that look like phone numbers,
// years, or trivially small values (e.g. the "2" in "2pm").
function extractAmounts(text) {
  const norm = normalizeDigits(text);
  const amounts = [];
  // Match digit groups with optional comma separators (e.g. 5,000) or plain (e.g. 850, 1200).
  const re = /\d{1,3}(?:,\d{3})+|\d+/g;
  let m;
  while ((m = re.exec(norm)) !== null) {
    const token = m[0];
    const digitsOnly = token.replace(/,/g, '');
    // Skip phone-number-like long runs (>= 9 digits) and obvious non-amounts.
    if (digitsOnly.length >= 9) continue;
    const value = parseInt(digitsOnly, 10);
    if (!Number.isFinite(value)) continue;
    if (value < 10) continue; // ignore tiny tokens like clock hours
    if (value === 2026 || value === 2025 || value === 2027) continue; // year noise
    amounts.push(value);
  }
  // De-duplicate, preserve order.
  return [...new Set(amounts)];
}

function has(text, patterns) {
  return patterns.some((p) => p.test(text));
}

// Main entry: returns a structured signal bag consumed by classify + match.
function extractSignals(complaint, declaredLanguage) {
  const raw = typeof complaint === 'string' ? complaint : '';
  const text = raw;
  const lower = raw.toLowerCase();
  const language = detectLanguage(raw, declaredLanguage);

  const amounts = extractAmounts(raw);

  // Transaction-type hints from natural language (English + Bangla).
  const typeHints = new Set();
  if (has(lower, [/\btransfer/, /\bsent\b/, /\bsend\b/, /pathie?ye?chi/, /পাঠিয়েছি/, /পাঠ/])) typeHints.add(TXN_TYPE.TRANSFER);
  if (has(lower, [/\bpay(ment|ed|ing)?\b/, /\bpaid\b/, /\bbill\b/, /recharge/, /রিচার্জ/, /বিল/, /পেমেন্ট/])) typeHints.add(TXN_TYPE.PAYMENT);
  if (has(lower, [/cash[\s-]?in/, /ক্যাশ\s?ইন/, /deposit/])) typeHints.add(TXN_TYPE.CASH_IN);
  if (has(lower, [/cash[\s-]?out/, /withdraw/, /ক্যাশ\s?আউট/])) typeHints.add(TXN_TYPE.CASH_OUT);
  if (has(lower, [/settl(e|ed|ement)/, /সেটেলমেন্ট/])) typeHints.add(TXN_TYPE.SETTLEMENT);
  if (has(lower, [/refund/, /ফেরত/])) typeHints.add(TXN_TYPE.REFUND);

  // Intent / safety signals (drive case_type priority in classify.js).
  const mentionsCredential = has(lower, [/\botp\b/, /\bpin\b/, /password/, /ওটিপি/, /পিন/, /পাসওয়ার্ড/]);
  const phishingSignal = mentionsCredential && has(lower, [
    /call(ed)?\b/, /someone/, /claim/, /from bkash/, /will be blocked/, /block(ed)?\b/, /is this real/, /scam/, /fraud/, /\bsms\b/, /message/, /asked for/, /ফোন/, /কল/, /ব্লক/,
  ]);
  const duplicateSignal = has(lower, [/twice/, /two times/, /double/, /duplicate/, /২\s?বার/, /দুইবার/, /দুবার/, /deducted twice/]);
  const failedSignal = has(lower, [/fail(ed|ure)?/, /unsuccessful/, /ব্যর্থ/, /হয়নি/]) &&
    has(lower, [/deduct/, /cut\b/, /কেটে/, /কাটা/, /balance/, /ব্যালেন্স/, /gone/, /charged/]);
  const refundSignal = has(lower, [/refund/, /ফেরত/, /money back/, /return my (money|payment)/, /টাকা ফেরত/]);
  const settlementSignal = has(lower, [/settl(e|ed|ement)/, /সেটেলমেন্ট/, /payout/]);
  const cashInSignal = has(lower, [/cash[\s-]?in/, /ক্যাশ\s?ইন/]) || (typeHints.has(TXN_TYPE.CASH_IN));
  const notReceivedSignal = has(lower, [
    /didn'?t (get|receive)/, /did not (get|receive)/, /not received/, /hasn'?t (got|received)/,
    /never (got|received)/, /না আসে?নি/, /আসেনি/, /পাইনি/, /পায়নি/, /দেখছি না/, /দেখা যাচ্ছে না/,
  ]);
  const wrongTransferSignal = has(lower, [
    /wrong (number|person|account|recipient|nambar)/, /ভুল (নম্বর|নাম্বার|মানুষ|একাউন্ট)/,
    /wrong\s+\d/, /typed it wrong/, /by mistake/, /mistakenly/, /to the wrong/,
  ]);
  const merchantSignal = has(lower, [/merchant/, /\bsales\b/, /মার্চেন্ট/]);
  const agentSignal = has(lower, [/agent/, /এজেন্ট/]);

  return {
    raw: text,
    lower,
    language,
    amounts,
    typeHints,
    mentionsCredential,
    phishingSignal,
    duplicateSignal,
    failedSignal,
    refundSignal,
    settlementSignal,
    cashInSignal,
    notReceivedSignal,
    wrongTransferSignal,
    merchantSignal,
    agentSignal,
  };
}

module.exports = { extractSignals, extractAmounts, normalizeDigits, detectLanguage };
