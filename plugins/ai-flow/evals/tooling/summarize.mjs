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
// D3: tool-use counts of a run whose nested subagents ran outside the trace are not observable.
const toolCount = (r, pick) => (r.tool_use?.unobserved_subagents > 0 ? 'n/a' : num(pick(r.tool_use)));
const bool01 = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : 'n/a');

/** Per agent type { mean, stdev } of per_phase tokens_total over runs that have per_phase; null when none do. */
function perPhaseTokens(runs) {
  const withPhase = runs.filter((r) => r.per_phase);
  if (withPhase.length === 0) return null;
  const types = [...new Set(withPhase.flatMap((r) => Object.keys(r.per_phase)))].sort();
  return Object.fromEntries(types.map((t) => [t, describe(withPhase.map((r) => r.per_phase[t]?.tokens_total ?? 0))]));
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
  };
}

/** As-shipped SessionStart outcome from the first non-harness run (REQ-012 as amended). */
function asShipped(runs) {
  const ss = runs.find((r) => !r.harness_error && r.session_start)?.session_start;
  return ss ? { hook_outcome: ss.hook_outcome, exit_code: ss.exit_code, injected_tokens: ss.injected_tokens_est } : null;
}

export function summarize(runs, meta, { sessionStartIntended = null } = {}) {
  const byCase = new Map();
  for (const r of runs) {
    const id = caseId(r.case);
    if (!byCase.has(id)) byCase.set(id, []);
    byCase.get(id).push(r);
  }
  const cases = {};
  for (const [id, rs] of [...byCase].sort()) cases[id] = aggregateCase(rs);
  const shipped = asShipped(runs);
  const sessionStart = { ...(shipped ? { as_shipped: shipped } : {}), ...(sessionStartIntended ? { intended: sessionStartIntended } : {}) };
  const out = { schema_version: 1, meta, ...(Object.keys(sessionStart).length ? { session_start: sessionStart } : {}), cases };
  return assertValid(SUMMARY_SCHEMA, out, 'summary');
}
