// Tasks 3.6-3.8 (REQ-017 S1-S6, U1, U4): regression rule, rate tolerance, n/a, missing cases, env guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPARE = path.join(HERE, '..', 'compare.mjs');
const BASELINE = path.join(HERE, 'fixtures', 'aggregate', 'baseline-min.json');

function cli(args) {
  return spawnSync(process.execPath, [COMPARE, ...args], { encoding: 'utf8' });
}

test('compare(baseline-min, baseline-min) exits 0 and prints the table header', () => {
  const r = cli(['--baseline', BASELINE, '--candidate', BASELINE]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /case\s*\|\s*metric\s*\|\s*baseline\s*\|\s*candidate\s*\|\s*delta\s*\|\s*status/);
});

import { compare } from '../compare.mjs';
const base = () => JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const withA = (patch) => { const c = base(); Object.assign(c.cases.a, patch); return c; };
const row = (res, cs, metric) => res.rows.find((r) => r.case === cs && r.metric === metric);

test('S1: tokens 1080 vs mean 1000 sd 100 is within noise; exit 0', () => {
  const res = compare(base(), withA({ tokens_total: { mean: 1080, stdev: 90 } }));
  assert.equal(row(res, 'a', 'tokens_total').status, 'ok');
  assert.equal(res.exitCode, 0);
});

test('[regression] S2: tokens 1150 vs mean 1000 sd 100 is flagged; exit 1', () => {
  const res = compare(base(), withA({ tokens_total: { mean: 1150, stdev: 90 } }));
  const r = row(res, 'a', 'tokens_total');
  assert.equal(r.status, 'regression');
  assert.equal(r.delta, 150);
  assert.equal(res.exitCode, 1);
});

test('S3: tokens 600 is an improvement, not a regression; exit 0', () => {
  const res = compare(base(), withA({ tokens_total: { mean: 600, stdev: 50 } }));
  assert.equal(row(res, 'a', 'tokens_total').status, 'improvement');
  assert.equal(res.exitCode, 0);
});

test('directions come from config: a lower pass rate or higher subagent_ask is worse', () => {
  assert.equal(row(compare(base(), withA({ outcome_pass_rate: { mean: 0.333, stdev: 0.577 } })), 'a', 'outcome_pass_rate').status, 'regression');
  assert.equal(row(compare(base(), withA({ subagent_ask: { mean: 1, stdev: 0 } })), 'a', 'subagent_ask').status, 'regression');
  assert.equal(row(compare(base(), withA({ per_phase_tokens: { 'ai-flow:implementer': { mean: 50000, stdev: 0 } } })), 'a', 'per_phase_tokens.ai-flow:implementer').status, 'regression');
});

test('--markdown and --json both produce output', () => {
  const dir = tmpDir('aiflow-cmp-');
  const cand = path.join(dir, 'cand.json');
  fs.writeFileSync(cand, JSON.stringify(withA({ tokens_total: { mean: 1150, stdev: 90 } })));
  const out = path.join(dir, 'cmp.json');
  const r = cli(['--baseline', BASELINE, '--candidate', cand, '--markdown', '--json', out]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^\| case \| metric \|/m);
  assert.match(r.stdout, /\| a \| tokens_total \| 1000 \| 1150 \| \+150 \| regression \|/);
  const j = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(j.regressions, 1);
  assert.ok(Array.isArray(j.rows));
});

// Task 3.7 (REQ-017 S4-S6, amended by U4).
test('S4: rate metric baseline 1.0 sd 0: candidate 0.667 is NOT flagged, 0.333 IS flagged (tolerance 0.34)', () => {
  assert.equal(row(compare(base(), withA({ outcome_pass_rate: { mean: 0.667, stdev: 0.577 } })), 'a', 'outcome_pass_rate').status, 'ok');
  assert.equal(row(compare(base(), withA({ outcome_pass_rate: { mean: 0.333, stdev: 0.577 } })), 'a', 'outcome_pass_rate').status, 'regression');
  assert.equal(row(compare(base(), withA({ tdd_ratio: { mean: 0.667, stdev: 0.577 } })), 'a', 'tdd_ratio').status, 'ok');
});

test('non-rate metric with sd 0 and --abs-tolerance 0: any worse value is flagged; a tolerance absorbs it', () => {
  const cand = withA({ readonly_writes: { mean: 0.333, stdev: 0.577 } });
  assert.equal(row(compare(base(), cand), 'a', 'readonly_writes').status, 'regression');
  assert.equal(row(compare(base(), cand, { absTolerance: 0.5 }), 'a', 'readonly_writes').status, 'ok');
});

test('S5: for a subset candidate [a], other baseline cases show "not run" and do not fail the comparison', () => {
  const cand = base();
  delete cand.cases.d;
  cand.meta.cases_run = ['a'];
  const res = compare(base(), cand);
  const notRun = res.rows.filter((r) => r.case === 'd');
  assert.equal(notRun.length, 1);
  assert.equal(notRun[0].status, 'not run');
  assert.equal(res.exitCode, 0);
});

test('S6: n/a in both baseline and candidate is shown as n/a and not flagged', () => {
  const r = row(compare(base(), base()), 'd', 'artifact_completeness');
  assert.equal(r.status, 'n/a');
  assert.equal(r.baseline, 'n/a');
  assert.equal(r.candidate, 'n/a');
});

// Task 3.8 (U1, D3): comparing across eval models or claude major versions is refused unless allowed.
test('a sonnet baseline vs an opus candidate exits 6 with "model mismatch"; --allow-env-mismatch applies normal rules', () => {
  const dir = tmpDir('aiflow-cmp-');
  const cand = path.join(dir, 'opus.json');
  const c = base(); c.meta.model = 'opus';
  fs.writeFileSync(cand, JSON.stringify(c));
  const r = cli(['--baseline', BASELINE, '--candidate', cand]);
  assert.equal(r.status, 6);
  assert.match(r.stderr, /model mismatch/);
  assert.equal(cli(['--baseline', BASELINE, '--candidate', cand, '--allow-env-mismatch']).status, 0);
});

test('a different claude major version also exits 6', () => {
  const c = base(); c.meta.claude_version = '3.0.1';
  const res = compare(base(), c);
  assert.equal(res.exitCode, 6);
  assert.match(res.envMismatch.join(), /claude major/);
  assert.equal(compare(base(), c, { allowEnvMismatch: true }).exitCode, 0);
  const minor = base(); minor.meta.claude_version = '2.2.0';
  assert.equal(compare(base(), minor).exitCode, 0);
});
