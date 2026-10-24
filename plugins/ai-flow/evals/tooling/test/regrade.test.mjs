// B2b Task 0.4 (design D10, REQ-018 S2): $0 regrade of a results dir from its retained bundles.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EVALS_DIR, TEXTKIT_CACHE } from '../lib/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUB = path.join(HERE, 'fixtures', 'stub-claude.mjs');
const REGRADE = path.join(HERE, '..', 'regrade.mjs');
const MINI = path.join(HERE, 'fixtures', 'nested', 'mini-tdd');
const skip = fs.existsSync(path.join(TEXTKIT_CACHE, 'node_modules')) ? false : 'no .eval-cache (run prepare.mjs)';
const created = [];
after(() => { for (const d of created) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); created.push(d); return d; };

let stubResults = null;
/** A results dir produced by the runner against the stub CLI with the mini-tdd nested scenario (built once). */
function stubResultsDir() {
  if (stubResults) return stubResults;
  const dir = tmp('aiflow-regrade-');
  const ws = tmp('aiflow-regrade-ws-');
  const lib = path.join(EVALS_DIR, 'fixtures', 'scaffold-lib.sh');
  const r = spawnSync('bash', ['-c', `set -e; source "${lib}"; scaffold_textkit "${path.join(HERE, 'fixtures', 'workspaces', 'a-fixed')}"`], { cwd: ws, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: tmp('aiflow-home-') } });
  assert.equal(r.status, 0, r.stderr);
  const scenario = path.join(dir, 'scenario.json');
  fs.writeFileSync(scenario, JSON.stringify({ caseName: 'a-e2e-bugfix-slugify', traceFile: path.join(MINI, 'trace.jsonl'), workspaceFrom: ws, nested: { transcriptsDir: MINI, sessionId: 's-mini' } }));
  const out = path.join(dir, 'out');
  const res = spawnSync('bash', [path.join(EVALS_DIR, 'run.sh'), '--case', 'a', '--runs', '1', '--plugin-ref', 'v3.4.0', '--out', out], { encoding: 'utf8', env: { ...process.env, AIFLOW_EVAL_CLAUDE_BIN: STUB, AIFLOW_STUB_SCENARIO: scenario } });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  stubResults = out;
  return out;
}

function copyResults() {
  const d = path.join(tmp('aiflow-regrade-copy-'), 'results');
  fs.cpSync(stubResultsDir(), d, { recursive: true });
  return d;
}

const regrade = (...args) => spawnSync(process.execPath, [REGRADE, ...args], { encoding: 'utf8' });

test('regrade on a copy of a stub results dir exits 0 and writes summary.json to --out (tracer, D10)', { skip }, () => {
  const src = copyResults();
  const out = tmp('aiflow-regrade-out-');
  const r = regrade(src, '--out', out);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(out, 'summary.json')));
});

const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(...p), 'utf8'));

test('the regraded run equals the original on tdd, tool_use and nested_capture; meta and session_start are preserved', { skip }, () => {
  const src = copyResults();
  const out = tmp('aiflow-regrade-out-');
  assert.equal(regrade(src, '--out', out).status, 0);
  const before = readJson(src, 'runs', 'a-0.json');
  const after_ = readJson(out, 'runs', 'a-0.json');
  for (const k of ['tdd', 'tool_use', 'nested_capture', 'agent_tree', 'outcome', 'cli']) assert.deepEqual(after_[k], before[k], k);
  assert.equal(after_.nested_capture.status, 'complete');
  const s0 = readJson(src, 'summary.json');
  const s1 = readJson(out, 'summary.json');
  const { regraded_from: from, regraded_at: at, regrade_reason: why, results_dir: dir, ...meta } = s1.meta;
  const { results_dir: _src, ...meta0 } = s0.meta;
  assert.deepEqual(meta, meta0);
  assert.equal(from, path.resolve(src));
  assert.equal(dir, path.resolve(out));
  assert.match(at, /^\d{4}-/);
  assert.equal(why, null);
  assert.deepEqual(s1.session_start, s0.session_start);
  assert.deepEqual(s1.cases, s0.cases);
});

test('a legacy flat traces/<case>-<i>.trace.jsonl with nested launches regrades to capture failed "nested transcripts not retained (pre-B2b trace)" (REQ-018 S2)', { skip }, () => {
  const src = copyResults();
  fs.rmSync(path.join(src, 'traces', 'a-0'), { recursive: true });
  fs.copyFileSync(path.join(MINI, 'trace.jsonl'), path.join(src, 'traces', 'a-0.trace.jsonl'));
  const out = tmp('aiflow-regrade-out-');
  assert.equal(regrade(src, '--out', out).status, 0);
  const m = readJson(out, 'runs', 'a-0.json');
  assert.equal(m.nested_capture.status, 'failed');
  assert.equal(m.nested_capture.reason, 'nested transcripts not retained (pre-B2b trace)');
  assert.equal(m.tdd.applicable, false);
});

test('regrade copies the outcome from the prior metrics instead of recomputing it', { skip }, () => {
  const src = copyResults();
  const f = path.join(src, 'runs', 'a-0.json');
  const prior = readJson(f);
  prior.outcome = { ...prior.outcome, pass: false, marker: 'prior' };
  fs.writeFileSync(f, JSON.stringify(prior));
  const out = tmp('aiflow-regrade-out-');
  assert.equal(regrade(src, '--out', out).status, 0);
  assert.deepEqual(readJson(out, 'runs', 'a-0.json').outcome, prior.outcome);
  assert.equal(readJson(out, 'summary.json').cases.a.outcome_pass_rate.mean, 0);
});

// B2b Batch 4 (REQ-008 via D10): regrade re-classifies a W5 run_error from the retained bundle instead of copying it.
const PROBE3 = path.join(HERE, 'fixtures', 'nested', 'probe-depth3');
const W5 = (n) => `mocks: memx: the harness answered ${n} agent mock calls the trace does not show (the responder was reached other than through the mocked tools)`;
function w5Results(errorRaw) {
  const dir = path.join(tmp('aiflow-regrade-w5-'), 'results');
  fs.cpSync(PROBE3, path.join(dir, 'traces', 'a-0'), { recursive: true });
  const stale = { message: 'stale', class: 'unexplained', details: null, reason: 'stale prior classification' };
  return { dir, prior: { case: 'a-e2e-bugfix-slugify', run_index: 0, harness_error: false, error_raw: errorRaw, failure_reason: errorRaw ? 'run-error' : null, run_error: errorRaw ? stale : null } };
}

test('regrade re-classifies a W5 run_error from the retained mock calls and transcripts (nested_mock_accounting, failure_reason null)', async () => {
  const { regradeRun } = await import('../regrade.mjs');
  const { dir, prior } = w5Results(W5(2));
  const m = regradeRun(prior, dir);
  assert.equal(m.run_error.class, 'nested_mock_accounting', JSON.stringify(m.run_error));
  assert.deepEqual(m.run_error.details, { server: 'memx', reported: 2, unseen: 2, found_in_transcripts: 2, method: 'mock-calls' });
  assert.equal(m.failure_reason, null);
});

test('negative: regrade of a W5 error that does not reconcile (5 reported) stays unexplained with failure_reason run-error; a clean run keeps run_error null', async () => {
  const { regradeRun } = await import('../regrade.mjs');
  const bad = w5Results(W5(5));
  const m = regradeRun(bad.prior, bad.dir);
  assert.equal(m.run_error.class, 'unexplained');
  assert.match(m.run_error.reason, /memx: reported 5/);
  assert.equal(m.failure_reason, 'run-error');
  const clean = w5Results(null);
  const c = regradeRun(clean.prior, clean.dir);
  assert.equal(c.run_error, null);
  assert.equal(c.failure_reason, null);
});

// B2b rework: the alpha.2 gate is regraded at $0 after grader fixes (W5 truncated input, backup files) and the
// baseline re-promoted from the regraded dir. The regrade must keep everything promote guards on
// (session_start.measured) and record when and why it ran; the regrade dir becomes results_dir, the source dir
// (aggregate-result.json, traces/) is regraded_from.
function gateLikeResults() {
  const { dir, prior } = w5Results(W5(2));
  fs.mkdirSync(path.join(dir, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runs', 'a-0.json'), JSON.stringify({ ...prior, cli: { costUsd: 0.1, durationSeconds: 10 } }));
  const ok = readJson(HERE, 'fixtures', 'aggregate', 'ok-summary.json');
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ ...ok, meta: { ...ok.meta, results_dir: dir } }));
  return { dir, ok };
}

test('regrade keeps session_start.measured and records regraded_at, regrade_reason, regraded_from and the regrade dir as results_dir', async () => {
  const { regrade: regradeDir } = await import('../regrade.mjs');
  const { dir, ok } = gateLikeResults();
  const out = tmp('aiflow-regrade-out-');
  const { summary } = regradeDir(dir, out, { reason: 'W5 truncated-input fix', now: () => '2026-10-23T20:00:00.000Z' });
  assert.deepEqual(summary.session_start.measured, ok.session_start.measured);
  assert.equal(summary.meta.regraded_at, '2026-10-23T20:00:00.000Z');
  assert.equal(summary.meta.regrade_reason, 'W5 truncated-input fix');
  assert.equal(summary.meta.regraded_from, path.resolve(dir));
  assert.equal(summary.meta.results_dir, path.resolve(out));
});

test('the regrade CLI takes --reason and records it with an ISO regraded_at', () => {
  const { dir } = gateLikeResults();
  const out = tmp('aiflow-regrade-out-');
  const r = regrade(dir, '--out', out, '--reason', 'backup files are not impl files');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const s = readJson(out, 'summary.json');
  assert.equal(s.meta.regrade_reason, 'backup files are not impl files');
  assert.match(s.meta.regraded_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});
