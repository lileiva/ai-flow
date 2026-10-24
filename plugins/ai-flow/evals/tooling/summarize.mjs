#!/usr/bin/env node
// Per-case aggregates (REQ-015) from per-run metrics, validated against schema/summary.schema.json.
// Harness-error runs are excluded from every aggregate (n records the included runs).
import fs from 'node:fs';
import path from 'node:path';
import { TOOLING_DIR } from './lib/paths.mjs';
import { describe, describeApplicable } from './lib/stats.mjs';
import { assertValid } from './lib/schema.mjs';

export const SUMMARY_SCHEMA = JSON.parse(fs.readFileSync(path.join(TOOLING_DIR, 'schema', 'summary.schema.json'), 'utf8'));

export const caseId = (name) => String(name).split('-')[0];

const tddValue = (r, pick) => (r.tdd?.applicable ? pick(r.tdd) : 'n/a');
const num = (v) => (typeof v === 'number' ? v : 'n/a');
// D3 / B2b D4: tool-use counts of a legacy run with unobserved nested subagents, or of a run whose capture is
// partial or failed (tool_use.applicable false), are n/a, never a false 0.
const toolCount = (r, pick) => (r.tool_use?.unobserved_subagents > 0 || r.tool_use?.applicable === false ? 'n/a' : num(pick(r.tool_use)));
const bool01 = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : 'n/a');

/** Per agent type { mean, stdev } of per_phase tokens_total over runs that have per_phase; null when none do. */
function perPhaseTokens(runs) {
  const withPhase = runs.filter((r) => r.per_phase);
  if (withPhase.length === 0) return null;
  const types = [...new Set(withPhase.flatMap((r) => Object.keys(r.per_phase)))].sort();
  return Object.fromEntries(types.map((t) => [t, describe(withPhase.map((r) => r.per_phase[t]?.tokens_total ?? 0))]));
}

const STATUSES = ['complete', 'partial', 'failed', 'not_applicable'];
const countBy = (runs, keys, pick) => Object.fromEntries(keys.map((k) => [k, runs.filter((r) => pick(r) === k).length]));

const perAgentTokens = (r) => (r.per_phase ? Object.fromEntries(Object.entries(r.per_phase).map(([t, p]) => [t, p.tokens_total ?? null])) : null);

/** Per agent type { mean, stdev } of a per-run { type: tokens } map (absent types count 0); null when no run has one. */
function describeByAgent(maps) {
  const have = maps.filter(Boolean);
  if (!have.length) return null;
  const types = [...new Set(have.flatMap((m) => Object.keys(m)))].sort();
  return Object.fromEntries(types.map((t) => [t, describe(have.map((m) => m[t] ?? 0))]));
}

/** One runs[] entry (REQ-010 S1, W4): informational values of a run, kept so an outlier run stays visible. */
const runEntry = (r) => ({
  run_index: r.run_index,
  harness_error: Boolean(r.harness_error),
  tokens_total: r.tokens?.total ?? null,
  cost_usd: r.cli?.costUsd ?? null,
  wall_time_s: r.cli?.durationSeconds ?? null,
  per_agent_tokens: perAgentTokens(r),
  per_agent_tokens_transcript: r.per_agent_tokens_transcript ?? null,
  max_depth: r.agent_tree ? Math.max(0, ...r.agent_tree.map((t) => t.depth ?? 0)) : null,
  agents_launched: r.agent_tree ? r.agent_tree.length : null,
  nested_capture: r.nested_capture?.status ?? null,
  run_error_class: r.run_error?.class ?? null,
  retried: r.retried ?? 0,
});

/**
 * B2b fields of a case (REQ-002 S4, REQ-005, REQ-007, REQ-008 S4, REQ-010 S1, TG2), present only when its runs are
 * new-format (they carry nested_capture): capture status counts, run-error classes, capture-caused n/a per grader,
 * self_delegation, per-run detail, and the informational transcript-summed tokens per agent type.
 */
function nestedFields(runs, ok) {
  if (!ok.some((r) => r.nested_capture)) return {};
  const capNa = (g) => ok.filter((r) => r[g]?.na_cause === 'capture').length;
  const sd = (r) => (typeof r.tool_use?.self_delegation?.count === 'number' ? r.tool_use.self_delegation.count : 'n/a');
  return {
    nested_capture: countBy(ok, STATUSES, (r) => r.nested_capture?.status),
    run_errors: countBy(ok, ['nested_mock_accounting', 'unexplained'], (r) => r.run_error?.class),
    na_capture: { tdd: capNa('tdd'), artifacts: capNa('artifacts'), tool_use: capNa('tool_use') },
    self_delegation: ok.length ? describeApplicable(ok.map(sd)) : null,
    per_agent_tokens_transcript: describeByAgent(ok.map((r) => r.per_agent_tokens_transcript)),
    runs: [...runs].sort((a, b) => a.run_index - b.run_index).map(runEntry),
  };
}

function aggregateCase(runs) {
  const ok = runs.filter((r) => !r.harness_error);
  const harnessErrors = runs.length - ok.length;
  // n=0: every run was a harness error. All metrics are null (not zero, not n/a) and the reason is explicit.
  const na = (stat) => (ok.length === 0 ? null : stat);
  return {
    n: ok.length,
    harness_errors: harnessErrors,
    harness_errors_retried: ok.filter((r) => r.retried > 0).length,
    ...(ok.length === 0 ? { no_data_reason: `all ${harnessErrors} run(s) were harness errors` } : {}),
    outcome_pass_rate: describe(ok.map((r) => (r.outcome?.pass ? 1 : 0))),
    tokens_total: describe(ok.map((r) => r.tokens?.total)),
    cost_usd: describe(ok.map((r) => r.cli?.costUsd)),
    wall_time_s: describe(ok.map((r) => r.cli?.durationSeconds)),
    tdd_score: na(describeApplicable(ok.map((r) => tddValue(r, (t) => (t.pass ? 1 : 0))))),
    tdd_ratio: na(describeApplicable(ok.map((r) => tddValue(r, (t) => t.ratio)))),
    phase_order: na(describeApplicable(ok.map((r) => bool01(r.phases?.order_ok)))),
    artifact_completeness: na(describeApplicable(ok.map((r) => (r.artifacts?.applicable ? num(r.artifacts.score) : 'n/a')))),
    subagent_ask: na(describeApplicable(ok.map((r) => toolCount(r, (t) => t?.subagent_ask?.total)))),
    readonly_writes: na(describeApplicable(ok.map((r) => toolCount(r, (t) => t?.readonly_writes?.total)))),
    per_phase_tokens: na(perPhaseTokens(ok)),
    ...nestedFields(runs, ok),
  };
}

/** As-shipped SessionStart outcome from the first non-harness run (REQ-012 as amended). */
function asShipped(runs) {
  const ss = runs.find((r) => !r.harness_error && r.session_start)?.session_start;
  // injected_tokens (kept for v3.4.0 compatibility) is the chars/4 estimate of the hook stdout, not the band metric
  // (that is session_start.measured.as_shipped.input_delta_tokens).
  return ss ? { hook_outcome: ss.hook_outcome, exit_code: ss.exit_code, injected_tokens: ss.injected_tokens_est, injected_tokens_est_chars4: ss.injected_tokens_est } : null;
}

/** The measure-session-start output as recorded in summary.session_start.measured (REQ-009 S1), or {error}. */
function measuredSessionStart(m) {
  if (!m) return null;
  if (m.error) return { error: m.error };
  return { as_shipped: m.as_shipped ?? null, intended: m.intended ?? null, first_turn_input_tokens: m.first_turn_input_tokens ?? null, method: m.intended?.method ?? m.method ?? null,
    claude_version: m.claude_version ?? null, plugin_ref: m.plugin_ref ?? null, model: m.model ?? null, cost_usd: m.cost_usd ?? null };
}

export function summarize(runs, meta, { sessionStartIntended = null, sessionStartMeasured = null } = {}) {
  const byCase = new Map();
  for (const r of runs) {
    const id = caseId(r.case);
    if (!byCase.has(id)) byCase.set(id, []);
    byCase.get(id).push(r);
  }
  const cases = {};
  for (const [id, rs] of [...byCase].sort()) cases[id] = aggregateCase(rs);
  const shipped = asShipped(runs);
  const measured = measuredSessionStart(sessionStartMeasured);
  const sessionStart = { ...(shipped ? { as_shipped: shipped } : {}), ...(sessionStartIntended ? { intended: sessionStartIntended } : {}), ...(measured ? { measured } : {}) };
  const out = { schema_version: 1, meta, ...(Object.keys(sessionStart).length ? { session_start: sessionStart } : {}), cases };
  return assertValid(SUMMARY_SCHEMA, out, 'summary');
}
