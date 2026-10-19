// Task 1.2 (REQ-015 S1, REQ-016 S1): run-metrics and baseline schemas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTrace } from '../analyze.mjs';
import { loadSchema, validate } from '../lib/schema.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = fs.readFileSync(path.join(HERE, 'fixtures', 'traces', 'real-case-a.jsonl'), 'utf8');
const RUN_SCHEMA = loadSchema('run-metrics');
const BASELINE_SCHEMA = loadSchema('baseline');

function realRunMetrics() {
  const a = analyzeTrace(REAL);
  return {
    case: 'a-e2e-bugfix-slugify', run_index: 0, harness_error: false, failure_reason: null, error_raw: null,
    cli: { score: 1, passed: true, turns: 10, costUsd: 1.19, judgeCostUsd: 0.1, durationSeconds: 409, graders: [] },
    tokens: a.tokens,
    per_phase: a.per_phase ?? null,
    per_phase_reason: a.per_phase ? null : 'not computed',
    tdd: a.tdd,
    outcome: { visible: { passed: 21, failed: 0, exit: 0 }, acceptance: { passed: 4, failed: 0, total: 4, exit: 0 }, pass: true },
  };
}

const paths = (errs) => errs.map((e) => e.path);

test('the real case (a) run-metrics validates', () => {
  assert.deepEqual(validate(RUN_SCHEMA, realRunMetrics()), []);
});

test('missing tokens.total is rejected with its path', () => {
  const m = realRunMetrics();
  delete m.tokens.total;
  assert.ok(paths(validate(RUN_SCHEMA, m)).includes('$.tokens.total'));
});

test('per_phase null without per_phase_reason is rejected with its path', () => {
  const m = { ...realRunMetrics(), per_phase: null };
  delete m.per_phase_reason;
  assert.ok(paths(validate(RUN_SCHEMA, m)).includes('$.per_phase_reason'));
  assert.ok(paths(validate(RUN_SCHEMA, { ...m, per_phase_reason: null })).includes('$.per_phase_reason'));
});

test('tdd.pass outside {true,false,null} is rejected with its path', () => {
  const m = realRunMetrics();
  m.tdd.pass = 'yes';
  assert.ok(paths(validate(RUN_SCHEMA, m)).includes('$.tdd.pass'));
});

function baseline() {
  return {
    schema_version: 1,
    meta: { plugin_version: '3.4.0', plugin_ref: 'v3.4.0', plugin_sha: 'abc', claude_version: '2.1.301', model: 'sonnet', judge_model: 'haiku', date: '2026-10-18T00:00:00Z', runs_per_case: 3, cap_usd: null, cases_run: ['a'], complete: true, incomplete_reason: null, total_cost_usd: 3 },
    session_start: {
      as_shipped: { hook_outcome: 'error', exit_code: 126, injected_tokens: 0 },
      intended: { hook_tokens: 1839, hook_chars: 6800, always_on_tokens: 1832, method: 'first-turn input delta' },
    },
    cases: { a: { n: 3, harness_errors: 0, outcome_pass_rate: { mean: 1, stdev: 0 }, tokens_total: { mean: 1, stdev: 0 }, cost_usd: { mean: 1, stdev: 0 }, wall_time_s: { mean: 1, stdev: 0 }, tdd_score: 'n/a', tdd_ratio: 'n/a', phase_order: { mean: 1, stdev: 0 }, artifact_completeness: { mean: 1, stdev: 0 }, subagent_ask: { mean: 0, stdev: 0 }, readonly_writes: { mean: 0, stdev: 0 }, per_phase_tokens: null } },
  };
}

test('a complete baseline validates', () => {
  assert.deepEqual(validate(BASELINE_SCHEMA, baseline()), []);
});

test('baseline requires session_start.as_shipped, session_start.intended, meta.model and meta.complete === true', () => {
  const noShipped = baseline(); delete noShipped.session_start.as_shipped;
  assert.ok(paths(validate(BASELINE_SCHEMA, noShipped)).includes('$.session_start.as_shipped'));
  const noIntended = baseline(); delete noIntended.session_start.intended;
  assert.ok(paths(validate(BASELINE_SCHEMA, noIntended)).includes('$.session_start.intended'));
  const noModel = baseline(); delete noModel.meta.model;
  assert.ok(paths(validate(BASELINE_SCHEMA, noModel)).includes('$.meta.model'));
  const incomplete = baseline(); incomplete.meta.complete = false;
  assert.ok(paths(validate(BASELINE_SCHEMA, incomplete)).includes('$.meta.complete'));
});

test('baseline inherits the summary rules (a broken case stat is reported)', () => {
  const b = baseline();
  b.cases.a.tokens_total = 'lots';
  assert.ok(paths(validate(BASELINE_SCHEMA, b)).some((p) => p.startsWith('$.cases.a.tokens_total')));
});

// Task 2.14 (REQ-015 S1): the runner's assembled metrics for the real run validate.
import { assembleRunMetrics, harnessErrorMetrics } from '../lib/metrics.mjs';

const CLI_RUN = { score: 1, passed: true, turns: 10, costUsd: 1.19, judgeCostUsd: 0.1, durationSeconds: 409, error: null, tracePath: '/x/out/trace.jsonl', graders: [{ name: 'completed', passed: true, scored: true }] };
const OUTCOME = { visible: { passed: 21, failed: 0, exit: 0 }, acceptance: { passed: 4, failed: 0, total: 4, exit: 0 }, pass: true };

test('assembleRunMetrics(analyze(real-case-a) + outcome) validates and carries every grader block', () => {
  const caseName = 'a-e2e-bugfix-slugify';
  const m = assembleRunMetrics({ caseName, index: 0, run: CLI_RUN, analysis: analyzeTrace(REAL, { caseName }), outcome: OUTCOME });
  assert.deepEqual(validate(RUN_SCHEMA, m), []);
  for (const k of ['tokens', 'per_phase', 'tdd', 'phases', 'artifacts', 'tool_use', 'session_start', 'env', 'outcome']) assert.ok(k in m, k);
  assert.equal(m.harness_error, false);
});

test('harness-error metrics validate with null totals and explicit reasons (no zeros)', () => {
  const m = harnessErrorMetrics({ caseName: 'b-x', index: 1, run: { ...CLI_RUN, error: 'scaffold failed' }, reason: null });
  assert.deepEqual(validate(RUN_SCHEMA, m), []);
  assert.equal(m.tokens.total, null);
  assert.equal(m.per_phase, null);
  assert.match(m.per_phase_reason, /harness error/);
});
