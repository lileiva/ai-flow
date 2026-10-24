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

// B2b Task 1.1 (REQ-014 S2, D6, D8): additive fields; old files keep validating.
function newFormatRunMetrics() {
  const m = realRunMetrics();
  m.nested_capture = { status: 'partial', expected: 2, captured: 1, missing: [{ tool_use_id: 't2', agent: 'ai-flow:planner', launched_by: 't1', depth: 2 }], orphans: [], inconsistent: [], reason: 'capture partial: missing planner' };
  m.agent_tree = [{ tool_use_id: 't1', agent: 'ai-flow:orchestrator', depth: 1, launched_by: 'main', source: 'transcript' }];
  m.tdd = { ...m.tdd, na_cause: null };
  m.artifacts = { applicable: false, score: null, missing: [], reason: 'capture partial: missing planner', na_cause: 'capture' };
  m.tool_use = { subagent_ask: { total: 0, by_agent: {} }, readonly_writes: { total: 0, by_agent: {} }, unknown_attribution: 0, self_delegation: { count: 0, launches: [] } };
  m.run_error = { message: 'mocks: memx: the harness answered 2 agent mock calls the trace does not show', class: 'nested_mock_accounting', details: { server: 'memx', reported: 2, unseen: 2, found_in_transcripts: 2 } };
  return m;
}

test('a new-format run-metrics (nested_capture, agent_tree, self_delegation, run_error, na_cause) validates (REQ-014 S2)', () => {
  assert.deepEqual(validate(RUN_SCHEMA, newFormatRunMetrics()), []);
  assert.deepEqual(validate(RUN_SCHEMA, { ...newFormatRunMetrics(), run_error: null }), []);
});

test('seeded negatives: nested_capture.status, run_error.class and na_cause outside their enums are rejected', () => {
  const bogus = newFormatRunMetrics();
  bogus.nested_capture.status = 'bogus';
  assert.ok(paths(validate(RUN_SCHEMA, bogus)).includes('$.nested_capture.status'));
  const cls = newFormatRunMetrics();
  cls.run_error.class = 'weird';
  assert.ok(paths(validate(RUN_SCHEMA, cls)).includes('$.run_error.class'));
  const cause = newFormatRunMetrics();
  cause.artifacts.na_cause = 'other';
  assert.ok(paths(validate(RUN_SCHEMA, cause)).includes('$.artifacts.na_cause'));
});

test('the committed v3.4.0-sonnet baseline still validates, and a new-format baseline validates too (REQ-014 S2)', () => {
  const v340 = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'baselines', 'v3.4.0-sonnet.json'), 'utf8'));
  assert.deepEqual(validate(BASELINE_SCHEMA, v340), []);
  const b = baseline();
  b.meta = { ...b.meta, label: 'v4.0.0-alpha.2', observability: { nested_capture: 'transcripts', analyzer: 'b2b' }, session_start_cost_usd: 0.13 };
  b.session_start.measured = { as_shipped: { input_delta_tokens: 2890 }, first_turn_input_tokens: 1000, method: 'first-turn input delta', claude_version: '2.1.309', plugin_ref: '8029d9b', cost_usd: 0.13 };
  Object.assign(b.cases.a, {
    nested_capture: { complete: 2, partial: 1, failed: 0, not_applicable: 0 },
    run_errors: { nested_mock_accounting: 3, unexplained: 0 },
    na_capture: { tdd: 0, artifacts: 1, tool_use: 1 },
    self_delegation: { mean: 0, stdev: 0 },
    runs: [{ run_index: 0, tokens_total: 1, cost_usd: 1, wall_time_s: 1, per_agent_tokens: {}, max_depth: 2, agents_launched: 10, nested_capture: 'complete', run_error_class: null, retried: 0 }],
  });
  assert.deepEqual(validate(BASELINE_SCHEMA, b), []);
  b.cases.a.nested_capture.complete = 'two';
  assert.ok(paths(validate(BASELINE_SCHEMA, b)).some((p) => p.startsWith('$.cases.a.nested_capture')));
});
