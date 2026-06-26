'use strict';

// Live smoke test against a RUNNING service (local or deployed).
// Usage:  BASE_URL=https://your-service.example.com node test/live_smoke.js
// Default BASE_URL is http://127.0.0.1:8000
// Checks: /health, then every public sample input -> schema completeness,
// enum legality, ticket echo, safe reply, and per-request latency < 30s.

const pack = require('../SUST_Preli_Sample_Cases.json');
const { screenReply } = require('../src/safety');
const { VALID } = require('../src/enums');

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const REQUIRED = [
  'ticket_id', 'relevant_transaction_id', 'evidence_verdict', 'case_type',
  'severity', 'department', 'agent_summary', 'recommended_next_action',
  'customer_reply', 'human_review_required',
];

async function main() {
  let failures = 0;
  let maxLatency = 0;

  const health = await fetch(`${BASE_URL}/health`);
  const healthBody = await health.json().catch(() => ({}));
  if (health.status !== 200 || healthBody.status !== 'ok') {
    console.error(`✗ /health failed: status=${health.status} body=${JSON.stringify(healthBody)}`);
    process.exit(1);
  }
  console.log('✓ /health ok');

  for (const c of pack.cases) {
    const t0 = Date.now();
    let res;
    let body;
    try {
      res = await fetch(`${BASE_URL}/analyze-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c.input),
      });
      body = await res.json();
    } catch (e) {
      console.error(`✗ ${c.id} request error: ${e.message}`);
      failures++;
      continue;
    }
    const latency = Date.now() - t0;
    maxLatency = Math.max(maxLatency, latency);

    const problems = [];
    if (res.status !== 200) problems.push(`status ${res.status}`);
    for (const f of REQUIRED) if (body[f] === undefined) problems.push(`missing ${f}`);
    if (body.ticket_id !== c.input.ticket_id) problems.push('ticket_id mismatch');
    if (!VALID.case_type.includes(body.case_type)) problems.push(`bad case_type ${body.case_type}`);
    if (!VALID.department.includes(body.department)) problems.push(`bad department ${body.department}`);
    if (!VALID.evidence_verdict.includes(body.evidence_verdict)) problems.push(`bad verdict`);
    if (!VALID.severity.includes(body.severity)) problems.push('bad severity');
    if (!screenReply(body.customer_reply || '').safe) problems.push('UNSAFE reply');
    if (latency > 30000) problems.push(`latency ${latency}ms > 30s`);

    if (problems.length) {
      console.error(`✗ ${c.id} (${latency}ms): ${problems.join('; ')}`);
      failures++;
    } else {
      console.log(`✓ ${c.id} (${latency}ms) -> ${body.case_type}/${body.evidence_verdict}/${body.department}`);
    }
  }

  console.log(`\nMax latency: ${maxLatency}ms · Failures: ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
