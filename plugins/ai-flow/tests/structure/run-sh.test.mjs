// tests/run.sh single entrypoint (REQ-001, REQ-002). Uses self-test env overrides and fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLUGIN_ROOT, gitMode, validatePluginCopy } from '../lib/plugin-files.mjs';

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

// W4 (B2b verify): without .eval-cache, cache-dependent evals tests skip (and a few fail); say how to fix it.
const PREPARE_HINT = /run `node plugins\/ai-flow\/evals\/tooling\/prepare\.mjs` first/;

test('evals tests skipped for a missing .eval-cache print the prepare.mjs hint with the skip count', () => {
  const r = runSh({ AIFLOW_TESTS_EVALS_CMD: `bash ${fx('fake-evals-nocache.sh')}`, AIFLOW_TESTS_EVAL_CACHE_DIR: os.tmpdir() });
  assert.match(r.stdout, PREPARE_HINT, r.stdout);
  assert.match(r.stdout, /2 evals tests skipped for it/);
  assert.match(r.last, /^executed: /, 'the executed line stays last');
});

test('a missing .eval-cache dir prints the prepare.mjs hint next to the floor failure', () => {
  const r = runSh({ AIFLOW_TESTS_EVAL_CACHE_DIR: path.join(os.tmpdir(), 'aiflow-no-such-eval-cache'), AIFLOW_TESTS_MIN_EXECUTED: '1000' });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /\.eval-cache is missing/);
  assert.match(r.stdout, PREPARE_HINT);
  assert.match(r.stdout, /executed 5 is below MIN_EXECUTED 1000/);
});

test('negative: with the cache present and no cache skips there is no prepare.mjs hint', () => {
  const r = runSh({ AIFLOW_TESTS_EVAL_CACHE_DIR: os.tmpdir() });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /prepare\.mjs/);
});

test('node older than 20 is rejected', () => {
  const r = runSh({ PATH: `${fx('old-node')}:/usr/bin:/bin` });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /node >= 20 is required \(found v18\.19\.0\)/);
});

// ---- claude plugin validate on temp plugin copies (REQ-002 S1, S2) ----
const SKIP_VALIDATE = process.env.AIFLOW_TESTS_SKIP_VALIDATE === '1' ? 'AIFLOW_TESTS_SKIP_VALIDATE=1 (claude plugin validate opted out)' : false;

test('claude plugin validate passes on a temp copy of the plugin', { skip: SKIP_VALIDATE }, () => {
  const r = validatePluginCopy();
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('negative: claude plugin validate fails on a temp copy with a malformed plugin.json', { skip: SKIP_VALIDATE }, () => {
  const r = validatePluginCopy((dir) => fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), '{ "name": "ai-flow", '));
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
});
