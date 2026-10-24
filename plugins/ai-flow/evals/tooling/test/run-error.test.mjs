// B2b Task 2.6 (REQ-008 S1-S3, design D7): W5 CLI run-errors classified nested_mock_accounting | unexplained.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRun } from '../lib/classify.mjs';
import { analyzeTrace } from '../analyze.mjs';
import { loadBundle } from '../lib/nested.mjs';

const NESTED = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'nested');
const run = (o = {}) => ({ score: 1, passed: true, tracePath: '/x/out/trace.jsonl', ...o });

test('classifyRun with an analysis returns run_error when the run carries a CLI error (tracer, REQ-008)', () => {
  const c = classifyRun(run({ error: 'something odd' }), { traceExists: true, analysis: {} });
  assert.ok('run_error' in c);
  assert.equal(c.run_error.message, 'something odd');
  assert.equal(c.run_error.class, 'unexplained');
});

const E6 = (n = 2, server = 'memx') => `mocks: ${server}: the harness answered ${n} agent mock calls the trace does not show (the responder was reached other than through the mocked tools)`;
const analyzed = (dir, caseName = 'probe') => analyzeTrace(fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8'), { caseName, bundle: loadBundle(dir) });
const classify = (error, analysis) => classifyRun(run({ error }), { traceExists: true, analysis });
const PROBE = path.join(NESTED, 'probe-depth3');

test('the real E6 error with the probe-depth3 bundle: nested_mock_accounting, the 2 unseen calls found in transcripts, failure_reason null (REQ-008 S1)', () => {
  const c = classify(E6(), analyzed(PROBE));
  assert.equal(c.harness_error, false);
  assert.equal(c.failure_reason, null);
  assert.equal(c.run_error.class, 'nested_mock_accounting');
  assert.deepEqual(c.run_error.details, { server: 'memx', reported: 2, unseen: 2, found_in_transcripts: 2, method: 'mock-calls' });
});

test('the real live case-a error (41 engram calls) with the live-a bundle, which has no mock-calls.jsonl: reconciled by the count fallback (REQ-008 S1)', () => {
  const c = classify(E6(41, 'plugin_engram_engram'), analyzed(path.join(NESTED, 'live-a'), 'a-e2e-bugfix-slugify'));
  assert.equal(c.run_error.class, 'nested_mock_accounting');
  assert.deepEqual(c.run_error.details, { server: 'plugin_engram_engram', reported: 41, unseen: null, found_in_transcripts: 41, method: 'count' });
  assert.equal(c.failure_reason, null);
});

test('counts that do not reconcile (5 reported, 2 found): unexplained with a reason, failure_reason stays run-error (REQ-008 S2)', () => {
  const c = classify(E6(5), analyzed(PROBE));
  assert.equal(c.run_error.class, 'unexplained');
  assert.match(c.run_error.reason, /memx: reported 5/);
  assert.equal(c.failure_reason, 'run-error');
  assert.equal(c.harness_error, false);
});

test('capture failed: the run-error is unexplained (the calls cannot be looked for)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const c = classify(E6(), analyzed(mutateBundle(PROBE, { corrupt: 'all' })));
  assert.equal(c.run_error.class, 'unexplained');
  assert.match(c.run_error.reason, /capture failed/);
});

test('a clean run has no run_error (REQ-008 S3)', () => {
  assert.equal(classifyRun(run(), { traceExists: true, analysis: analyzed(PROBE) }).run_error, undefined);
});

test('no mock-calls.jsonl: the probe error is reconciled by the transcript-only call count', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const c = classify(E6(), analyzed(mutateBundle(PROBE, { noMockCalls: true })));
  assert.equal(c.run_error.class, 'nested_mock_accounting');
  assert.equal(c.run_error.details.method, 'count');
  assert.equal(c.run_error.details.found_in_transcripts, 2);
});

test('other error text next to a reconciled mock clause keeps the run-error unexplained', () => {
  const c = classify(`${E6()}; max turns reached`, analyzed(PROBE));
  assert.equal(c.run_error.class, 'unexplained');
  assert.equal(c.failure_reason, 'run-error');
});

test('the run_error message is scrubbed of local paths and emails', () => {
  const c = classify(`failed at ${'/Use' + 'rs'}/someone/x for a@b.io`, analyzed(PROBE));
  assert.equal(c.run_error.message, 'failed at /home/user/x for <email>');
});

// Found by the alpha.2 gate (cases c-0, c-2): the CLI records a large mock input (about 16 KB) as a truncated JSON
// string ending in '…[truncated]' (first 16384 chars), not an object. Such a call is matched by prefix against the
// transcript call's serialized input.
async function withMockInput(fn) {
  const { mutateBundle } = await import('./helpers.mjs');
  const dir = mutateBundle(PROBE);
  const file = path.join(dir, 'mock-calls.jsonl');
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  lines.forEach((l) => { if (l.input?.text === 'from-leaf') l.input = fn(JSON.stringify(l.input)); });
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return dir;
}

test('a mock call whose input the CLI recorded as a truncated JSON string is matched by prefix: nested_mock_accounting', async () => {
  const c = classify(E6(), analyzed(await withMockInput((json) => `${json.slice(0, -4)}…[truncated]`)));
  assert.equal(c.run_error.class, 'nested_mock_accounting', c.run_error.reason);
  assert.equal(c.run_error.details.found_in_transcripts, 2);
});

test('negative: a truncated string input that is not a prefix of any transcript call stays unexplained', async () => {
  const c = classify(E6(), analyzed(await withMockInput(() => '{"text":"from-nowhere…[truncated]')));
  assert.equal(c.run_error.class, 'unexplained');
  assert.match(c.run_error.reason, /memx: reported 2, found 1/);
});
