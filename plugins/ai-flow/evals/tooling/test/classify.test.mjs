// Task 3.4 (REQ-013 S3, REQ-003 S2, D12, U5; user decision: rate limits stop the runner, no retry).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRun, exitCodeFor } from '../lib/classify.mjs';

const run = (extra = {}) => ({ score: 0, error: null, tracePath: '/x/out/trace.jsonl', ...extra });

test('"scaffold failed", API, auth and rate-limit errors and a missing trace are harness errors', () => {
  assert.deepEqual(classifyRun(run({ error: 'scaffold failed: exit 1' }), { traceExists: true }), { harness_error: true, failure_reason: 'scaffold_failed' });
  assert.equal(classifyRun(run({ error: 'API Error: 500 Internal' }), { traceExists: true }).harness_error, true);
  assert.equal(classifyRun(run({ error: 'authentication_error: invalid x-api-key' }), { traceExists: true }).harness_error, true);
  assert.deepEqual(classifyRun(run({ error: 'API Error: 429 rate limit exceeded' }), { traceExists: true }), { harness_error: true, failure_reason: 'rate_limited' });
  assert.deepEqual(classifyRun(run(), { traceExists: false }), { harness_error: true, failure_reason: 'no_trace' });
});

test('a timeout is a case failure with reason "timeout" (U5)', () => {
  assert.deepEqual(classifyRun(run({ error: 'run timed out after 1800s' }), { traceExists: true, lastMainText: 'Working on batch 2…' }), { harness_error: false, failure_reason: 'timeout' });
});

test('a timeout whose last main-thread text presents a gate without AUTO-APPROVED is "blocked-on-gate"', () => {
  const r = classifyRun(run({ error: 'timeout' }), { traceExists: true, lastMainText: 'Plan ready. Do you approve the plan? (Approve / Revise / Reject)' });
  assert.deepEqual(r, { harness_error: false, failure_reason: 'blocked-on-gate' });
  const ok = classifyRun(run({ error: 'timeout' }), { traceExists: true, lastMainText: 'Plan summary.\nAUTO-APPROVED GATE: plan' });
  assert.equal(ok.failure_reason, 'timeout');
});

test('a mock expect abort is a case failure "mock-abort"; the agent-mock call budget is a harness error', () => {
  assert.deepEqual(classifyRun(run({ aborted: { server: 'plugin_engram_engram', tool: 'mem_save', reason: 'expect violated: title' } }), { traceExists: true }), { harness_error: false, failure_reason: 'mock-abort' });
  assert.equal(classifyRun(run({ aborted: { server: 's', tool: 't', reason: 'mock call budget exceeded' } }), { traceExists: true }).harness_error, true);
});

test('a clean run has no failure reason; another error is "run-error"', () => {
  assert.deepEqual(classifyRun(run(), { traceExists: true }), { harness_error: false, failure_reason: null });
  assert.equal(classifyRun(run({ error: 'max turns reached' }), { traceExists: true }).failure_reason, 'run-error');
});

test('exit code precedence is 3 > 4 > 2 > 5 > 1 > 0', () => {
  assert.equal(exitCodeFor({ preflight: true, projection: true, costCap: true, harness: true, regression: true }), 3);
  assert.equal(exitCodeFor({ projection: true, costCap: true, harness: true }), 4);
  assert.equal(exitCodeFor({ costCap: true, harness: true, regression: true }), 2);
  assert.equal(exitCodeFor({ harness: true, regression: true }), 5);
  assert.equal(exitCodeFor({ regression: true }), 1);
  assert.equal(exitCodeFor({}), 0);
});

test('a refused promotion exits 7, below preflight/cap/harness and above regression', () => {
  assert.equal(exitCodeFor({ promoteRefused: true, regression: true }), 7);
  assert.equal(exitCodeFor({ promoteRefused: true, harness: true }), 5);
});
