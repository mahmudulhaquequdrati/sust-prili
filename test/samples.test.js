'use strict';

// Runs all 10 public sample cases through analyzeTicket() and asserts functional
// equivalence on the scored fields: relevant_transaction_id, evidence_verdict,
// case_type, department, severity, human_review_required. Also checks schema
// completeness and that every customer_reply passes the safety screen.

const test = require('node:test');
const assert = require('node:assert');

const { analyzeTicket } = require('../src/analyze');
const { screenReply } = require('../src/safety');
const { VALID } = require('../src/enums');
const pack = require('../SUST_Preli_Sample_Cases.json');

const REQUIRED_FIELDS = [
  'ticket_id', 'relevant_transaction_id', 'evidence_verdict', 'case_type',
  'severity', 'department', 'agent_summary', 'recommended_next_action',
  'customer_reply', 'human_review_required',
];

for (const c of pack.cases) {
  test(`${c.id} — ${c.label}`, async () => {
    const out = await analyzeTicket(c.input);
    const exp = c.expected_output;

    // Schema completeness.
    for (const f of REQUIRED_FIELDS) {
      assert.ok(out[f] !== undefined, `missing field ${f}`);
    }
    assert.strictEqual(out.ticket_id, c.input.ticket_id, 'ticket_id must echo request');

    // Enum legality.
    assert.ok(VALID.case_type.includes(out.case_type), `bad case_type ${out.case_type}`);
    assert.ok(VALID.department.includes(out.department), `bad department ${out.department}`);
    assert.ok(VALID.evidence_verdict.includes(out.evidence_verdict), `bad verdict ${out.evidence_verdict}`);
    assert.ok(VALID.severity.includes(out.severity), `bad severity ${out.severity}`);
    assert.strictEqual(typeof out.human_review_required, 'boolean');

    // Functional equivalence on the scored decision fields.
    assert.strictEqual(out.relevant_transaction_id, exp.relevant_transaction_id, 'relevant_transaction_id');
    assert.strictEqual(out.evidence_verdict, exp.evidence_verdict, 'evidence_verdict');
    assert.strictEqual(out.case_type, exp.case_type, 'case_type');
    assert.strictEqual(out.department, exp.department, 'department');
    assert.strictEqual(out.severity, exp.severity, 'severity');
    assert.strictEqual(out.human_review_required, exp.human_review_required, 'human_review_required');

    // Safety: the customer reply must always pass the screen.
    const screen = screenReply(out.customer_reply);
    assert.ok(screen.safe, `unsafe reply: ${screen.violations.join(',')}`);
  });
}
