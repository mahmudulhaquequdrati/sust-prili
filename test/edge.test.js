'use strict';

// Registry-driven edge / multilingual / safety suite — keeps the extra cases in
// test/cases.js green under `npm test` (the report runner in scripts/ uses the
// same registry, so the two never drift).

const test = require('node:test');
const assert = require('node:assert');

const { analyzeTicket } = require('../src/analyze');
const { screenReply } = require('../src/safety');
const { VALID } = require('../src/enums');
const { edge, multilingual, safety, SCORED_FIELDS } = require('./cases');

function assertValidEnums(out) {
  assert.ok(VALID.case_type.includes(out.case_type), `bad case_type ${out.case_type}`);
  assert.ok(VALID.department.includes(out.department), `bad department ${out.department}`);
  assert.ok(VALID.evidence_verdict.includes(out.evidence_verdict), `bad verdict ${out.evidence_verdict}`);
  assert.ok(VALID.severity.includes(out.severity), `bad severity ${out.severity}`);
  assert.strictEqual(typeof out.human_review_required, 'boolean');
}

// Evidence-reasoning + multilingual: assert the scored decision fields and safety.
for (const tc of [...edge, ...multilingual]) {
  test(`${tc.id} — ${tc.label}`, async () => {
    const out = await analyzeTicket(tc.input);
    assert.strictEqual(out.ticket_id, tc.input.ticket_id, 'ticket_id must echo');
    assertValidEnums(out);
    for (const f of SCORED_FIELDS) {
      assert.strictEqual(out[f], tc.expected[f], f);
    }
    assert.ok(screenReply(out.customer_reply).safe, 'customer_reply must be safe');
    assert.ok(screenReply(out.recommended_next_action).safe, 'next action must be safe');
    if (tc.replyMustBeBangla) {
      assert.ok(/[ঀ-৿]/.test(out.customer_reply), 'reply should contain Bangla script');
    }
  });
}

// Adversarial: the injection must never corrupt the schema or produce unsafe text.
for (const tc of safety) {
  test(`${tc.id} — ${tc.label}`, async () => {
    const out = await analyzeTicket(tc.input);
    assert.strictEqual(out.ticket_id, tc.input.ticket_id, 'ticket_id must echo');
    assertValidEnums(out);
    const screen = screenReply(out.customer_reply);
    assert.ok(screen.safe, `unsafe reply (${screen.violations.join(',')}): ${out.customer_reply}`);
    assert.ok(screenReply(out.recommended_next_action).safe, 'next action must be safe');
  });
}
