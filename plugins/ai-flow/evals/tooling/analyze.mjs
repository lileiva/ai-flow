#!/usr/bin/env node
// Per-run metrics from a trace (design D1): tokens, per-phase tokens and TDD adherence.
// Usage: node analyze.mjs <trace.jsonl>
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { agentTranscriptTokens, attributionIndex, parseTrace, perPhase, runTokens, toolCalls, traceUnreliable } from './lib/trace.mjs';
import { gradeTdd, tddEvents } from './lib/tdd.mjs';
import { gradePhases, phaseMode } from './lib/phases.mjs';
import { gradeArtifacts } from './lib/artifacts.mjs';
import { gradeToolUse } from './lib/tooluse.mjs';
import { runEnv, sessionStart } from './lib/env.mjs';
import { loadConfig, roles } from './lib/config.mjs';
import { rateLimitStatus } from './lib/ratelimit.mjs';
import { LEGACY_REASON, mergeNested, reconcileMocks } from './lib/nested.mjs';

/** Text of the final main-thread assistant message (used to spot a run blocked on a gate). */
export function lastMainText(lines) {
  const texts = lines.filter((o) => o.type === 'assistant' && !o.parent_tool_use_id).flatMap((o) => (o.message?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text));
  return texts.at(-1) ?? '';
}

/** Agents whose transcripts hold the artifact payloads (proposal, spec, design, plan). */
const ARTIFACT_OWNERS = new Set(['proposer', 'specifier', 'designer', 'planner']);

/**
 * n/a by capture (B2b design D4, REQ-005, replaces B1 D3 markUnobservable). complete / not_applicable: grades stand;
 * an n/a grade is intrinsic. failed: tdd, artifacts and tool_use are n/a "capture failed: <cause>". partial: TDD is
 * graded only if every missing agent is a no-write agent, artifacts only if no artifact owner is missing (a computed
 * grade carries capture_note); tool_use is n/a "capture partial: missing <agents>". An intrinsically n/a artifacts
 * grade (a case that expects none) keeps its own reason. Every n/a grade gets na_cause 'capture' | 'intrinsic'.
 */
export function applyCapture(a, capture, config = loadConfig()) {
  const r = roles(config);
  const intrinsic = (g) => (g.applicable === false ? { ...g, na_cause: 'intrinsic' } : g);
  const out = { ...a, tdd: intrinsic(a.tdd), artifacts: intrinsic(a.artifacts) };
  if (!capture || !['failed', 'partial'].includes(capture.status)) return out;
  const reason = `capture ${capture.status}: ${capture.reason}`;
  const missing = capture.missing.map((m) => r.shortName(m.agent));
  const naTdd = { applicable: false, pass: null, ratio: null, reason, na_cause: 'capture', impl_changes: [], env_errors: a.tdd.env_errors ?? 0 };
  const naArtifacts = { ...a.artifacts, applicable: false, score: null, reason, na_cause: 'capture' };
  const note = (g) => ({ ...g, capture_note: reason });
  const failed = capture.status === 'failed';
  const tddOk = !failed && missing.every((m) => r.isNoWrite(m));
  const artifactsOk = !failed && !missing.some((m) => ARTIFACT_OWNERS.has(m));
  return {
    ...out,
    tdd: tddOk ? (out.tdd.applicable ? note(out.tdd) : out.tdd) : naTdd,
    artifacts: out.artifacts.na_cause === 'intrinsic' ? out.artifacts : artifactsOk ? note(out.artifacts) : naArtifacts,
    tool_use: { ...a.tool_use, applicable: false, reason, na_cause: 'capture', ...('self_delegation' in a.tool_use ? { self_delegation: 'n/a' } : {}) },
  };
}

/** Every string value in v, newline-joined (TG6: sentinels are looked for in retained transcripts too, unescaped). */
const stringsOf = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(stringsOf).join('\n') : v && typeof v === 'object' ? Object.values(v).map(stringsOf).join('\n') : '');

export function analyzeTrace(text, { caseName, config = loadConfig(), sentinels = [], bundle } = {}) {
  const parsed = parseTrace(text);
  const { parseErrors } = parsed;
  // No bundle: a pre-B2b trace, whose nested transcripts were not retained (REQ-018 S2).
  const merged = mergeNested(parsed.lines, bundle ?? { agents: [], mockCalls: [], errors: [], source: 'none', reason: LEGACY_REASON });
  const lines = merged.lines;
  const cwd = lines.find((l) => l.type === 'system' && l.subtype === 'init')?.cwd;
  const idx = attributionIndex(lines);
  const calls = toolCalls(lines, idx);
  const unreliable = traceUnreliable(lines.length, parseErrors);
  const tokens = runTokens(lines, { unreliable });
  return applyCapture({ tokens, ...perPhase(lines, idx, tokens.total, { unreliable }), tdd: gradeTdd(tddEvents(calls, cwd)),
    phases: gradePhases(lines, config, { cwd, mode: phaseMode(caseName) }), artifacts: gradeArtifacts(calls, caseName),
    tool_use: gradeToolUse(calls, config, { cwd, tree: merged.tree }),
    session_start: sessionStart(lines), env: runEnv(lines, [text, ...(bundle?.agents ?? []).map((ag) => stringsOf(ag.lines))].join('\n'), calls, { sentinels }), parse_errors: parseErrors,
    last_main_text: lastMainText(lines), rate_limit: rateLimitStatus(lines),
    nested_capture: merged.capture, agent_tree: merged.tree, per_agent_tokens_transcript: agentTranscriptTokens(lines, merged.tree),
    mock_accounting: reconcileMocks(parsed.lines, lines, { mockCalls: bundle?.mockCalls, mockCallsFile: bundle?.mock_calls_file }) }, merged.capture, config);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(analyzeTrace(fs.readFileSync(process.argv[2], 'utf8')), null, 2));
}
