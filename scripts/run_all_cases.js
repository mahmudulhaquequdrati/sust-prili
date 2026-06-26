'use strict';

// run_all_cases.js — the one-command "test everything and show me the output" runner.
//   node scripts/run_all_cases.js        (or: npm run report)
//
// Runs EVERY scenario in test/cases.js across all categories and prints, per case:
//   PASS/FAIL · a field-level expected-vs-actual diff on mismatch · the full output.
// HTTP/robustness cases are exercised against a real server booted on an ephemeral
// port. Writes a reviewable artifact to docs/TEST_REPORT.md and exits non-zero on
// any failure, so it doubles as a CI gate and a manual review aid.

const fs = require('fs');
const path = require('path');

const { analyzeTicket } = require('../src/analyze');
const { screenReply } = require('../src/safety');
const { VALID } = require('../src/enums');
const { SCORED_FIELDS, logicCases, safety, robustness } = require('../test/cases');

const REQUIRED_FIELDS = [
  'ticket_id', 'relevant_transaction_id', 'evidence_verdict', 'case_type',
  'severity', 'department', 'agent_summary', 'recommended_next_action',
  'customer_reply', 'human_review_required',
];

const useColor = process.stdout.isTTY;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c('32', s);
const red = (s) => c('31', s);
const dim = (s) => c('2', s);
const bold = (s) => c('1', s);

// Accumulators for the console + the markdown report.
const results = [];
let maxLatency = 0;

function record(category, id, label, ok, problems, detail) {
  results.push({ category, id, label, ok, problems: problems || [], detail });
  const tag = ok ? green('PASS') : red('FAIL');
  console.log(`${tag} ${dim(`[${category}]`)} ${id} — ${label}`);
  if (!ok) for (const p of problems) console.log(`       ${red('•')} ${p}`);
}

function enumValid(out) {
  const bad = [];
  if (!VALID.case_type.includes(out.case_type)) bad.push(`case_type=${out.case_type}`);
  if (!VALID.department.includes(out.department)) bad.push(`department=${out.department}`);
  if (!VALID.evidence_verdict.includes(out.evidence_verdict)) bad.push(`verdict=${out.evidence_verdict}`);
  if (!VALID.severity.includes(out.severity)) bad.push(`severity=${out.severity}`);
  if (typeof out.human_review_required !== 'boolean') bad.push('human_review_required not boolean');
  return bad;
}

function schemaProblems(out, ticketId) {
  const probs = [];
  for (const f of REQUIRED_FIELDS) if (out[f] === undefined) probs.push(`missing field ${f}`);
  if (ticketId !== undefined && out.ticket_id !== ticketId) probs.push(`ticket_id echo: got ${out.ticket_id}, want ${ticketId}`);
  probs.push(...enumValid(out).map((b) => `bad enum ${b}`));
  return probs;
}

// ---- logic cases (samples + edge + multilingual) ----------------------------
async function runLogicCase(tc) {
  const t0 = Date.now();
  const out = await analyzeTicket(tc.input);
  const latency = Date.now() - t0;
  maxLatency = Math.max(maxLatency, latency);

  const problems = schemaProblems(out, tc.input.ticket_id);

  // Expected-vs-actual on the six scored decision fields.
  for (const f of SCORED_FIELDS) {
    if (out[f] !== tc.expected[f]) {
      problems.push(`${f}: expected ${JSON.stringify(tc.expected[f])}, got ${JSON.stringify(out[f])}`);
    }
  }

  // Safety always holds for customer-facing + agent-facing text.
  const replyScreen = screenReply(out.customer_reply);
  if (!replyScreen.safe) problems.push(`UNSAFE customer_reply: ${replyScreen.violations.join(',')}`);
  if (!screenReply(out.recommended_next_action).safe) problems.push('UNSAFE recommended_next_action');

  if (tc.replyMustBeBangla && !/[ঀ-৿]/.test(out.customer_reply)) {
    problems.push('customer_reply should be in Bangla');
  }

  record(tc.category, tc.id, tc.label, problems.length === 0, problems, { input: tc.input, expected: tc.expected, actual: out, latency });
}

// ---- adversarial safety cases ----------------------------------------------
async function runSafetyCase(tc) {
  const out = await analyzeTicket(tc.input);
  const problems = schemaProblems(out, tc.input.ticket_id);
  const replyScreen = screenReply(out.customer_reply);
  if (!replyScreen.safe) problems.push(`UNSAFE customer_reply (${replyScreen.violations.join(',')}): ${out.customer_reply}`);
  if (!screenReply(out.recommended_next_action).safe) problems.push('UNSAFE recommended_next_action');
  record(tc.category, tc.id, tc.label, problems.length === 0, problems, { input: tc.input, actual: out });
}

// ---- robustness / HTTP cases (need a real server) ---------------------------
async function runHttpCases(base) {
  for (const tc of robustness) {
    const problems = [];
    let status = null;
    let body = null;
    const t0 = Date.now();
    try {
      const opts = { method: tc.method };
      if (tc.rawBody !== undefined) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = tc.rawBody;
      } else if (tc.body !== undefined) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(tc.body);
      }
      const res = await fetch(`${base}${tc.path}`, opts);
      status = res.status;
      body = await res.json().catch(() => null);
    } catch (e) {
      problems.push(`request error: ${e.message}`);
    }
    const latency = Date.now() - t0;
    maxLatency = Math.max(maxLatency, latency);

    if (status !== tc.expectedStatus) problems.push(`status: expected ${tc.expectedStatus}, got ${status}`);
    if (tc.expectHealth && !(body && body.status === 'ok')) problems.push(`/health body not {"status":"ok"}: ${JSON.stringify(body)}`);
    if (tc.expectValidSchema && body) problems.push(...schemaProblems(body, tc.body && tc.body.ticket_id));
    if (tc.expectValidSchema && body && !screenReply(body.customer_reply || '').safe) problems.push('UNSAFE reply');
    if (tc.healthAfter) {
      const h = await fetch(`${base}/health`).then((r) => r.json()).catch(() => null);
      if (!(h && h.status === 'ok')) problems.push('service did not stay up after malformed input');
    }

    record(tc.category, tc.id, tc.label, problems.length === 0, problems, { status, latency, body });
  }
}

// ---- markdown artifact -------------------------------------------------------
function writeReport() {
  const lines = [];
  const pass = results.filter((r) => r.ok).length;
  lines.push('# TEST_REPORT — full case run', '');
  lines.push(`**${pass}/${results.length} passed** · max latency ${maxLatency} ms · generated by \`npm run report\`.`, '');

  const cats = [...new Set(results.map((r) => r.category))];
  for (const cat of cats) {
    lines.push(`## ${cat}`, '', '| Result | ID | Case |', '|---|---|---|');
    for (const r of results.filter((x) => x.category === cat)) {
      lines.push(`| ${r.ok ? '✅ PASS' : '❌ FAIL'} | ${r.id} | ${r.label} |`);
    }
    lines.push('');
  }

  const fails = results.filter((r) => !r.ok);
  if (fails.length) {
    lines.push('## Failures (detail)', '');
    for (const r of fails) {
      lines.push(`### ${r.id} — ${r.label}`, '');
      for (const p of r.problems) lines.push(`- ${p}`);
      lines.push('');
    }
  }

  // Full outputs for sample+edge+multilingual so the file also serves as a
  // reviewable "sample output" artifact for the submission.
  lines.push('## Full outputs (sample / edge / multilingual)', '');
  for (const r of results.filter((x) => ['sample', 'edge', 'multilingual'].includes(x.category))) {
    lines.push(`### ${r.id} — ${r.label}`, '', '```json', JSON.stringify(r.detail.actual, null, 2), '```', '');
  }

  const out = path.join(__dirname, '..', 'docs', 'TEST_REPORT.md');
  fs.writeFileSync(out, lines.join('\n'));
  console.log(dim(`\nReport written to docs/TEST_REPORT.md`));
}

async function main() {
  console.log(bold('\n▶ Logic cases (samples + edge + multilingual)\n'));
  for (const tc of logicCases) await runLogicCase(tc);

  console.log(bold('\n▶ Adversarial safety cases\n'));
  for (const tc of safety) await runSafetyCase(tc);

  console.log(bold('\n▶ Robustness / HTTP contract cases\n'));
  const app = require('../src/server');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await runHttpCases(base);
  } finally {
    server.close();
  }

  writeReport();

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(bold(`\n━━ Summary ━━`));
  console.log(`  ${green(`${pass} passed`)}${fail ? `, ${red(`${fail} failed`)}` : ''}  ·  ${results.length} cases  ·  max latency ${maxLatency} ms`);
  if (maxLatency > 30000) console.log(red('  ⚠ a request exceeded the 30s budget'));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
