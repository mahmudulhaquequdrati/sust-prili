'use strict';

// HTTP-level tests: boots the Express app on an ephemeral port and exercises the
// real endpoints, covering the API contract (200/400/422/404) and crash-safety.

const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/server');

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(() => {
  if (server) server.close();
});

test('GET /health returns {"status":"ok"}', async () => {
  const res = await fetch(`${base}/health`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body, { status: 'ok' });
});

test('POST /analyze-ticket returns 200 with all required fields', async () => {
  const res = await fetch(`${base}/analyze-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticket_id: 'HTTP-1',
      complaint: 'I sent 5000 taka to a wrong number.',
      transaction_history: [
        { transaction_id: 'TXN-X', timestamp: '2026-04-14T14:00:00Z', type: 'transfer', amount: 5000, counterparty: '+8801700000000', status: 'completed' },
      ],
    }),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ticket_id, 'HTTP-1');
  assert.strictEqual(body.relevant_transaction_id, 'TXN-X');
  assert.ok(typeof body.customer_reply === 'string' && body.customer_reply.length > 0);
});

test('POST with missing required field -> 400', async () => {
  const res = await fetch(`${base}/analyze-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ complaint: 'no ticket id here' }),
  });
  assert.strictEqual(res.status, 400);
});

test('POST with empty complaint -> 422', async () => {
  const res = await fetch(`${base}/analyze-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: 'T', complaint: '   ' }),
  });
  assert.strictEqual(res.status, 422);
});

test('POST with malformed JSON -> 400 and process stays alive', async () => {
  const res = await fetch(`${base}/analyze-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ not valid json',
  });
  assert.strictEqual(res.status, 400);
  // Service still responds afterwards.
  const health = await fetch(`${base}/health`);
  assert.strictEqual(health.status, 200);
});

test('unknown route -> 404', async () => {
  const res = await fetch(`${base}/nope`);
  assert.strictEqual(res.status, 404);
});
