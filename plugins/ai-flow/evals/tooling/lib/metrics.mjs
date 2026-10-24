// Per-run metrics assembly (REQ-015 S1, design section 3). Output validates against schema/run-metrics.schema.json.

function base({ caseName, index, run }) {
  return {
    case: caseName,
    run_index: index,
    cli: {
      score: run.score ?? null, passed: run.passed ?? null, turns: run.turns ?? null, costUsd: run.costUsd ?? null,
      judgeCostUsd: run.judgeCostUsd ?? null, durationSeconds: run.durationSeconds ?? null,
      graders: (run.graders ?? []).map((g) => ({ name: g.name, passed: g.passed, scored: g.scored })),
    },
    error_raw: run.error ?? null,
  };
}

/** Metrics for a run that reached a gradeable end state. */
export function assembleRunMetrics({ caseName, index, run, analysis: a, outcome, failureReason = null, harnessError = false, extra = {} }) {
  return {
    ...base({ caseName, index, run }),
    harness_error: harnessError,
    failure_reason: failureReason,
    tokens: a.tokens,
    per_phase: a.per_phase,
    per_phase_reason: a.per_phase_reason,
    per_phase_source: a.per_phase_source,
    per_phase_coverage: a.per_phase_coverage,
    tdd: a.tdd,
    phases: a.phases,
    artifacts: a.artifacts,
    tool_use: a.tool_use,
    session_start: a.session_start,
    env: a.env,
    parse_errors: a.parse_errors,
    ...(a.nested_capture ? { nested_capture: a.nested_capture, agent_tree: a.agent_tree, per_agent_tokens_transcript: a.per_agent_tokens_transcript ?? null } : {}),
    outcome,
    ...extra,
  };
}

/** Metrics for a harness-error run: no totals are guessed (null + reasons), graders are not applicable. */
export function harnessErrorMetrics({ caseName, index, run, reason = null, extra = {} }) {
  return {
    ...base({ caseName, index, run }),
    harness_error: true,
    failure_reason: reason,
    tokens: { total: null, source: 'unavailable' },
    per_phase: null,
    per_phase_reason: 'harness error: no gradeable trace',
    tdd: { applicable: false, pass: null, ratio: null, reason: 'harness error' },
    outcome: null,
    ...extra,
  };
}
