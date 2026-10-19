// tests/run.sh single entrypoint (REQ-001, REQ-002). Uses self-test env overrides and fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { PLUGIN_ROOT, gitMode } from '../lib/plugin-files.mjs';

const RUN_SH = path.join(PLUGIN_ROOT, 'tests', 'run.sh');
const FIX = path.join(PLUGIN_ROOT, 'tests', 'fixtures', 'run-sh');

/** Run run.sh against fixtures; `env` entries override (undefined deletes). */
function runSh(env = {}, { cwd = PLUGIN_ROOT } = {}) {
  const merged = {
    ...process.env,
    AIFLOW_TESTS_SKIP_VALIDATE: '1',
    AIFLOW_TESTS_STRUCTURE_GLOB: path.join(FIX, 'pass.test.mjs'),
    AIFLOW_TESTS_EVALS_CMD: `bash ${path.join(FIX, 'fake-evals.sh')}`,
    AIFLOW_TESTS_MIN_EXECUTED: '0',
    ...env,
  };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  const res = spawnSync('bash', [RUN_SH], { cwd, env: merged, encoding: 'utf8' });
  const lines = res.stdout.trimEnd().split('\n');
  return { ...res, lines, last: lines.at(-1) };
}

test('run.sh is 100755 in the git index and ends with an executed line', () => {
  assert.equal(gitMode('plugins/ai-flow/tests/run.sh'), '100755');
  const r = runSh();
  assert.match(r.last, /^executed: \d+/, r.stdout + r.stderr);
});

// ---- Behavior ----
const fx = (n) => path.join(FIX, n);
const NODE_DIR = path.dirname(process.execPath);

test('no early abort: a failing structure test does not stop the evals step (REQ-001 S2)', () => {
  const r = runSh({ AIFLOW_TESTS_STRUCTURE_GLOB: `${fx('pass.test.mjs')} ${fx('fail.test.mjs')}` });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /evals: ok/, 'evals step ran and passed');
  assert.match(r.stdout, /FAIL \[structure\].*fixture fails on purpose/, 'failing test named with its suite');
  assert.match(r.last, /^executed: 6 passed: 5 failed: 1 \(structure 3, evals 3, validate 0\)$/);
});

test('a suite that exits without a summary is reported CRASHED, not as 0 passed (REQ-001 S3)', () => {
  const r = runSh({ AIFLOW_TESTS_EVALS_CMD: `bash ${fx('fake-crash.sh')}` });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /evals: CRASHED \(no summary\)/);
});

test('a structure file with a syntax error fails the run (REQ-001 S3)', () => {
  const r = runSh({ AIFLOW_TESTS_STRUCTURE_GLOB: `${fx('pass.test.mjs')} ${fx('crash.test.mjs')}` });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /structure: FAILED/);
});

test('same result from a foreign cwd (REQ-001 S4)', () => {
  const here = runSh();
  const away = runSh({}, { cwd: os.tmpdir() });
  assert.equal(here.status, 0, here.stdout + here.stderr);
  assert.equal(away.status, here.status);
  assert.equal(away.last, here.last);
});

test('claude CLI missing without opt-out fails the validate step (REQ-002 S3)', () => {
  const r = runSh({ AIFLOW_TESTS_SKIP_VALIDATE: undefined, PATH: `${NODE_DIR}:/usr/bin:/bin` });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /validate: FAILED — claude CLI \(>= 2\.1\.301\) is required/);
});

test('validate opt-out is SKIPPED and not counted as passed (REQ-002 S3)', () => {
  const r = runSh({ PATH: `${NODE_DIR}:/usr/bin:/bin` });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /validate: SKIPPED \(AIFLOW_TESTS_SKIP_VALIDATE=1\)/);
  assert.match(r.last, /passed: 5 failed: 0 \(structure 2, evals 3, validate 0\)/);
});

test('executed count below the floor fails the run', () => {
  const r = runSh({ AIFLOW_TESTS_MIN_EXECUTED: '1000' });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /executed 5 is below MIN_EXECUTED 1000/);
  assert.match(r.last, /^executed: 5 /);
});

test('node older than 20 is rejected', () => {
  const r = runSh({ PATH: `${fx('old-node')}:/usr/bin:/bin` });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /node >= 20 is required \(found v18\.19\.0\)/);
});
