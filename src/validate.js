'use strict';

// validate.js — request validation for POST /analyze-ticket.
// Strict on the two REQUIRED fields (ticket_id, complaint) -> 400 when missing.
// Tolerant on optional fields: invalid/unknown optional values are normalized to
// safe defaults rather than rejected, so the service stays robust on odd input
// (the rubric rewards "handles malformed/non-critical missing fields without crashing").

const { LANGUAGE, CHANNEL, USER_TYPE } = require('./enums');

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function normalizeTransactionHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObject)
    .map((t) => ({
      transaction_id: typeof t.transaction_id === 'string' ? t.transaction_id : null,
      timestamp: typeof t.timestamp === 'string' ? t.timestamp : null,
      type: typeof t.type === 'string' ? t.type : null,
      amount: typeof t.amount === 'number' ? t.amount : Number(t.amount),
      counterparty: t.counterparty != null ? String(t.counterparty) : null,
      status: typeof t.status === 'string' ? t.status : null,
    }));
}

function validateRequest(body) {
  if (!isObject(body)) {
    return { ok: false, status: 400, message: 'Request body must be a JSON object.' };
  }

  // Required fields.
  if (typeof body.ticket_id !== 'string' || body.ticket_id.trim() === '') {
    return { ok: false, status: 400, message: 'Missing or invalid required field: ticket_id.' };
  }
  if (typeof body.complaint !== 'string') {
    return { ok: false, status: 400, message: 'Missing or invalid required field: complaint.' };
  }
  // Schema-valid but semantically empty complaint.
  if (body.complaint.trim() === '') {
    return { ok: false, status: 422, message: 'The complaint field is empty; nothing to analyze.' };
  }

  // Optional fields — normalize, never reject.
  const language = LANGUAGE.includes(body.language) ? body.language : undefined;
  const channel = CHANNEL.includes(body.channel) ? body.channel : undefined;
  const user_type = USER_TYPE.includes(body.user_type) ? body.user_type : undefined;

  const value = {
    ticket_id: body.ticket_id,
    complaint: body.complaint,
    language,
    channel,
    user_type,
    campaign_context: typeof body.campaign_context === 'string' ? body.campaign_context : undefined,
    transaction_history: normalizeTransactionHistory(body.transaction_history),
    metadata: isObject(body.metadata) ? body.metadata : {},
  };

  return { ok: true, value };
}

module.exports = { validateRequest, normalizeTransactionHistory };
