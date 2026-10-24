// Task 0.10 (REQ-015 S1-S3): per-case aggregates with sample stdev, validated against the summary schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../summarize.mjs';

const META = { plugin_version: '3.4.0', plugin_ref: 'v3.4.0', plugin_sha: 'abc', claude_version: '2.1.301', model: 'sonnet', judge_model: 'haiku', date: '2026-10-16T00:00:00Z', runs_per_case: 1, cap_usd: 8, cases_run: ['a'], complete: true, incomplete_reason: null, total_cost_usd: 1 };

function run(i, total, pass, extra = {}) {
  return { case: 'a', run_index: i, harness_error: false, tokens: { total }, outcome: { pass }, cli: { costUsd: 1, durationSeconds: 60 }, tdd: { applicable: true, pass, ratio: pass ? 1 : 0 }, ...extra };
}

test('one run produces a schema-valid summary', () => {
  const s = summarize([run(0, 100, true)], META);
  assert.equal(s.schema_version, 1);
  assert.ok(s.cases.a);
});

import { validate } from '../lib/schema.mjs';
import { SUMMARY_SCHEMA } from '../summarize.mjs';

test('S2: tokens 100/200/300 with pass/pass/fail -> mean 200, sample sd 100, pass_rate 0.667', () => {
  const s = summarize([run(0, 100, true), run(1, 200, true), run(2, 300, false)], { ...META, runs_per_case: 3 });
  assert.deepEqual(s.cases.a.tokens_total, { mean: 200, stdev: 100 });
  assert.equal(s.cases.a.outcome_pass_rate.mean, 0.667);
  assert.equal(s.cases.a.n, 3);
});

test('S3: a harness-error run is excluded: n=2, harness_errors=1', () => {
  const s = summarize([run(0, 100, true), run(1, 999999, false, { harness_error: true }), run(2, 300, true)], META);
  assert.equal(s.cases.a.n, 2);
  assert.equal(s.cases.a.harness_errors, 1);
  assert.equal(s.cases.a.tokens_total.mean, 200);
  assert.equal(s.cases.a.outcome_pass_rate.mean, 1);
});

test('n=1 gives stdev 0 and flags n_lt_2', () => {
  const s = summarize([run(0, 100, true)], META);
  assert.deepEqual(s.cases.a.tokens_total, { mean: 100, stdev: 0, n_lt_2: true });
});

test('runs with no applicable TDD report n/a', () => {
  const s = summarize([run(0, 100, true, { tdd: { applicable: false, pass: null, ratio: null } })], META);
  assert.equal(s.cases.a.tdd_score, 'n/a');
});

test('S1: invalid input is rejected and the failing path is reported', () => {
  assert.throws(() => summarize([run(0, 'lots', true)], META), (e) => e.code === 'SCHEMA_INVALID' && /\$\.cases\.a\.tokens_total/.test(e.message));
  const errs = validate(SUMMARY_SCHEMA, { schema_version: 1, meta: { ...META, complete: 'yes' }, cases: {} });
  assert.deepEqual(errs.map((e) => e.path), ['$.meta.complete']);
});

// Task 1.3 (REQ-007 S5, REQ-015): n/a-aware aggregation.
import { describeApplicable } from '../lib/stats.mjs';

test('describeApplicable: all n/a gives "n/a"; mixed excludes n/a and records n_applicable', () => {
  assert.equal(describeApplicable(['n/a', null, 'n/a']), 'n/a');
  assert.deepEqual(describeApplicable([1, 'n/a', 0, null]), { mean: 0.5, stdev: 0.707, n_applicable: 2 });
});

test('summary: mixed TDD applicability excludes n/a runs and records n_applicable', () => {
  const na = { tdd: { applicable: false, pass: null, ratio: null } };
  const s = summarize([run(0, 100, true), run(1, 100, true, na), run(2, 100, false)], META);
  assert.deepEqual(s.cases.a.tdd_score, { mean: 0.5, stdev: 0.707, n_applicable: 2 });
  assert.deepEqual(s.cases.a.tdd_ratio, { mean: 0.5, stdev: 0.707, n_applicable: 2 });
});

test('summary: all runs harness errors gives n=0, null metrics and a reason', () => {
  const he = { harness_error: true };
  const s = summarize([run(0, 1, true, he), run(1, 1, true, he)], META);
  const c = s.cases.a;
  assert.equal(c.n, 0);
  assert.equal(c.harness_errors, 2);
  for (const k of ['outcome_pass_rate', 'tokens_total', 'cost_usd', 'wall_time_s', 'tdd_score', 'tdd_ratio']) assert.equal(c[k], null, k);
  assert.match(c.no_data_reason, /harness error/);
});

// Task 2.14: summary aggregates the phase, artifact, tool-use and per-phase token metrics.
test('summary aggregates phase_order, artifact_completeness, subagent_ask, readonly_writes and per_phase_tokens', () => {
  const extra = (ok, score, ask, w, impl) => ({
    phases: { order_ok: ok }, artifacts: { applicable: true, score }, tool_use: { subagent_ask: { total: ask }, readonly_writes: { total: w } },
    per_phase: { 'ai-flow:implementer': { tokens_total: impl }, main: { tokens_total: 10 } },
  });
  const s = summarize([run(0, 100, true, extra(true, 1, 0, 0, 100)), run(1, 100, true, extra(false, 0.5, 2, 1, 300))], META);
  const c = s.cases.a;
  assert.deepEqual(c.phase_order, { mean: 0.5, stdev: 0.707, n_applicable: 2 });
  assert.deepEqual(c.artifact_completeness, { mean: 0.75, stdev: 0.354, n_applicable: 2 });
  assert.deepEqual(c.subagent_ask, { mean: 1, stdev: 1.414, n_applicable: 2 });
  assert.deepEqual(c.readonly_writes, { mean: 0.5, stdev: 0.707, n_applicable: 2 });
  assert.deepEqual(c.per_phase_tokens['ai-flow:implementer'], { mean: 200, stdev: 141.421 });
  assert.deepEqual(c.per_phase_tokens.main, { mean: 10, stdev: 0 });
});

test('runs without phase/artifact/tool-use data aggregate to n/a and per_phase_tokens null', () => {
  const c = summarize([run(0, 100, true)], META).cases.a;
  assert.equal(c.phase_order, 'n/a');
  assert.equal(c.artifact_completeness, 'n/a');
  assert.equal(c.per_phase_tokens, null);
});

import { loadConfig } from '../lib/config.mjs';
test('metric directions live in config: rate metrics are higher-is-better, cost/size metrics lower-is-better', () => {
  const { metrics } = loadConfig();
  for (const k of ['outcome_pass_rate', 'tdd_score', 'tdd_ratio', 'phase_order', 'artifact_completeness']) assert.deepEqual(metrics[k], { better: 'higher', rate: true }, k);
  for (const k of ['tokens_total', 'cost_usd', 'wall_time_s', 'subagent_ask', 'readonly_writes', 'per_phase_tokens']) assert.equal(metrics[k].better, 'lower', k);
});

test('summary.session_start.as_shipped comes from the runs (first non-harness run)', () => {
  const ss = { session_start: { hook_outcome: 'error', exit_code: 126, stdout_chars: 0, injected_tokens_est: 0 } };
  const s = summarize([run(0, 1, true, { harness_error: true }), run(1, 1, true, ss)], META);
  assert.deepEqual(s.session_start, { as_shipped: { hook_outcome: 'error', exit_code: 126, injected_tokens: 0, injected_tokens_est_chars4: 0 } }); // B2b REQ-009: estimate labelled
});

// B2b Task 3.1 (REQ-002 S4, REQ-008 S4, REQ-010 S1, REQ-005, REQ-007; TG2).
const capture = (status) => ({ status, expected: 2, captured: status === 'complete' ? 2 : 1, missing: [], orphans: [], inconsistent: [], reason: null });

test('summarize on a new-format run reports cases.a.nested_capture (tracer)', () => {
  const s = summarize([run(0, 100, true, { nested_capture: capture('complete') })], META);
  assert.equal(s.cases.a.nested_capture.complete, 1);
});

const newRun = (i, status, extra = {}) => run(i, 100 * (i + 1), true, {
  cli: { costUsd: i + 0.5, durationSeconds: 60 + i },
  nested_capture: capture(status),
  agent_tree: [{ tool_use_id: 'o', agent: 'ai-flow:orchestrator', depth: 1, launched_by: 'main' }, { tool_use_id: 'p', agent: 'ai-flow:planner', depth: 2, launched_by: 'o' }],
  per_phase: { 'ai-flow:planner': { tokens_total: 10 }, main: { tokens_total: 5 } },
  per_agent_tokens_transcript: { 'ai-flow:planner': 40 + i, main: 5 },
  tool_use: { subagent_ask: { total: 0, by_agent: {} }, readonly_writes: { total: 0, by_agent: {} }, unknown_attribution: 0, self_delegation: { count: i, launches: [] } },
  run_error: null,
  ...extra,
});

test('nested_capture counts per case: complete, complete, partial (REQ-002 S4)', () => {
  const s = summarize([newRun(0, 'complete'), newRun(1, 'complete'), newRun(2, 'partial')], META);
  assert.deepEqual(s.cases.a.nested_capture, { complete: 2, partial: 1, failed: 0, not_applicable: 0 });
});

test('run_errors counts per class (REQ-008 S4)', () => {
  const err = (cls) => ({ run_error: { message: 'm', class: cls, details: null, reason: null } });
  const s = summarize([newRun(0, 'complete', err('nested_mock_accounting')), newRun(1, 'complete', err('nested_mock_accounting')), newRun(2, 'complete', err('unexplained'))], META);
  assert.deepEqual(s.cases.a.run_errors, { nested_mock_accounting: 2, unexplained: 1 });
});

test('na_capture counts capture-caused n/a per grader, apart from intrinsic n/a (REQ-005)', () => {
  const capNa = { applicable: false, pass: null, ratio: null, reason: 'capture failed: x', na_cause: 'capture' };
  const s = summarize([
    newRun(0, 'failed', { tdd: capNa, artifacts: { applicable: false, score: null, missing: [], na_cause: 'capture' }, tool_use: { subagent_ask: { total: 0, by_agent: {} }, readonly_writes: { total: 0, by_agent: {} }, unknown_attribution: 0, applicable: false, na_cause: 'capture', self_delegation: 'n/a' } }),
    newRun(1, 'complete', { tdd: { applicable: false, pass: null, ratio: null, reason: 'no implementation changes', na_cause: 'intrinsic' } }),
  ], META);
  assert.deepEqual(s.cases.a.na_capture, { tdd: 1, artifacts: 1, tool_use: 1 });
});

test('runs[] lists every run with its informational values and capture status (REQ-010 S1, TG2)', () => {
  const s = summarize([newRun(0, 'complete'), newRun(1, 'complete', { retried: 1 }), newRun(2, 'partial', { run_error: { message: 'm', class: 'unexplained', details: null, reason: 'r' } })], META);
  assert.equal(s.cases.a.runs.length, 3);
  assert.deepEqual(s.cases.a.runs[2], { run_index: 2, harness_error: false, tokens_total: 300, cost_usd: 2.5, wall_time_s: 62, per_agent_tokens: { 'ai-flow:planner': 10, main: 5 }, per_agent_tokens_transcript: { 'ai-flow:planner': 42, main: 5 }, max_depth: 2, agents_launched: 2, nested_capture: 'partial', run_error_class: 'unexplained', retried: 0 });
  assert.equal(s.cases.a.runs[1].retried, 1);
  assert.deepEqual(s.cases.a.per_agent_tokens_transcript['ai-flow:planner'], { mean: 41, stdev: 1 });
});

test('self_delegation per case: mean of the counts; n/a runs excluded (REQ-007)', () => {
  const s = summarize([newRun(0, 'complete'), newRun(1, 'complete'), newRun(2, 'complete')], META);
  assert.deepEqual(s.cases.a.self_delegation, { mean: 1, stdev: 1, n_applicable: 3 });
});

test('a new-format summary validates against the schema; old-format runs get none of the B2b fields', () => {
  const s = summarize([newRun(0, 'complete'), newRun(1, 'partial')], META);
  assert.deepEqual(validate(SUMMARY_SCHEMA, s), []);
  const old = summarize([run(0, 100, true)], META);
  for (const k of ['nested_capture', 'run_errors', 'na_capture', 'self_delegation', 'runs', 'per_agent_tokens_transcript']) assert.ok(!(k in old.cases.a), k);
});
