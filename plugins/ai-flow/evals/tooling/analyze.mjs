#!/usr/bin/env node
// Per-run metrics from a trace (design D1): tokens, per-phase tokens and TDD adherence.
// Usage: node analyze.mjs <trace.jsonl>
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { attributionIndex, parseTrace, perPhase, runTokens, toolCalls, traceUnreliable, unobservedSubagents } from './lib/trace.mjs';
import { gradeTdd, tddEvents } from './lib/tdd.mjs';
import { gradePhases, phaseMode } from './lib/phases.mjs';
import { gradeArtifacts } from './lib/artifacts.mjs';
import { gradeToolUse } from './lib/tooluse.mjs';
import { runEnv, sessionStart } from './lib/env.mjs';
import { loadConfig } from './lib/config.mjs';
import { rateLimitStatus } from './lib/ratelimit.mjs';

/** Text of the final main-thread assistant message (used to spot a run blocked on a gate). */
export function lastMainText(lines) {
  const texts = lines.filter((o) => o.type === 'assistant' && !o.parent_tool_use_id).flatMap((o) => (o.message?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text));
  return texts.at(-1) ?? '';
}

/**
 * D3: nested subagents ran outside the trace, so TDD and artifact grades would be guesses: n/a with the reason.
 * Tool-use counts are kept (observed calls only) and flagged with unobserved_subagents (summaries treat them as n/a).
 */
function markUnobservable(a, unobserved) {
  if (!unobserved.length) return a;
  const reason = `not observable: ${unobserved.length} nested subagent(s) ran outside the trace (${[...new Set(unobserved.map((u) => u.agent))].join(', ')})`;
  return {
    ...a,
    tdd: { applicable: false, pass: null, ratio: null, reason, impl_changes: [], env_errors: a.tdd.env_errors ?? 0 },
    artifacts: { ...a.artifacts, applicable: false, score: null, reason },
    tool_use: { ...a.tool_use, unobserved_subagents: unobserved.length },
  };
}

export function analyzeTrace(text, { caseName, config = loadConfig(), sentinels = [] } = {}) {
  const { lines, parseErrors } = parseTrace(text);
  const cwd = lines.find((l) => l.type === 'system' && l.subtype === 'init')?.cwd;
  const idx = attributionIndex(lines);
  const calls = toolCalls(lines, idx);
  const unreliable = traceUnreliable(lines.length, parseErrors);
  const tokens = runTokens(lines, { unreliable });
  return markUnobservable({ tokens, ...perPhase(lines, idx, tokens.total, { unreliable }), tdd: gradeTdd(tddEvents(calls, cwd)),
    phases: gradePhases(lines, config, { cwd, mode: phaseMode(caseName) }), artifacts: gradeArtifacts(calls, caseName),
    tool_use: gradeToolUse(calls, config, { cwd }),
    session_start: sessionStart(lines), env: runEnv(lines, text, calls, { sentinels }), parse_errors: parseErrors,
    last_main_text: lastMainText(lines), rate_limit: rateLimitStatus(lines) }, unobservedSubagents(lines));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(analyzeTrace(fs.readFileSync(process.argv[2], 'utf8')), null, 2));
}
