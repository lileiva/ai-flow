// Task 0.8 (REQ-011 S1, REQ-007 S1-S2): trace parsing, token dedupe, attribution and the minimal TDD rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTrace } from '../analyze.mjs';

const TRACES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'traces');
// Trimmed real trace of the P0.13 tracer run (case a, sonnet, v3.4.0), produced by scripts/trim-trace.mjs.
const REAL = fs.readFileSync(path.join(TRACES, 'real-case-a.jsonl'), 'utf8');

test('analyzeTrace reports total tokens > 0 for a trace', () => {
  assert.ok(analyzeTrace(REAL).tokens.total > 0);
});

import { parseTrace, attributionIndex, agentOf } from '../lib/trace.mjs';
import { classifyTestRun, isTestFile, isImplFile } from '../lib/tdd.mjs';

const CWD = '/private/tmp/e-synth/sealed/home/cwd';

// Builders for small seeded traces.
let n = 0;
const use = (name, input, parent = null, id = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { id: `m${++n}`, content: [{ type: 'tool_use', id: id ?? `t${n}`, name, input }], usage: { input_tokens: 1, output_tokens: 1 } } });
const res = (u, content) => ({ type: 'user', parent_tool_use_id: u.parent_tool_use_id, message: { content: [{ type: 'tool_result', tool_use_id: u.message.content[0].id, content }] } });
const RED = ' Test Files  1 failed (1)\n      Tests  1 failed | 2 passed (3)\n';
const GREEN = ' Test Files  1 passed (1)\n      Tests  3 passed (3)\n';
function trace(steps) {
  const lines = [{ type: 'system', subtype: 'init', cwd: CWD }];
  for (const [u, out] of steps) { lines.push(u); if (out !== undefined) lines.push(res(u, out)); }
  return lines.map((l) => JSON.stringify(l)).join('\n');
}

test('usage repeated across 3 content blocks of one message.id counts once', () => {
  const { lines } = parseTrace(REAL);
  const assistant = lines.filter((l) => l.type === 'assistant');
  assert.ok(new Set(assistant.map((l) => l.message.id)).size < assistant.length, 'real trace repeats message ids');
  assert.equal(analyzeTrace(REAL).tokens.trace_total, 1258927);
});

test('run totals come from result.modelUsage; the trace sum and its coverage are kept alongside (P0.13 finding)', () => {
  // Real CLI 2.1.301 traces carry message_start usage snapshots (output_tokens undercounted: 2649 vs 35450) and
  // omit some background-subagent messages, so per-message sums undercount; result.modelUsage is authoritative.
  const { tokens } = analyzeTrace(REAL);
  assert.equal(tokens.source, 'result.modelUsage');
  assert.deepEqual([tokens.input, tokens.output, tokens.cache_read, tokens.cache_creation, tokens.total], [118, 35450, 1248648, 222953, 1507169]);
  assert.equal(tokens.trace_total, 1258927);
  assert.equal(tokens.trace_coverage, 0.835);
});

test('without a result line, totals fall back to the deduped trace sum', () => {
  const noResult = REAL.trim().split('\n').filter((l) => JSON.parse(l).type !== 'result').join('\n');
  const { tokens } = analyzeTrace(noResult);
  assert.equal(tokens.source, 'trace');
  assert.equal(tokens.total, 1258927);
});

test('parent_tool_use_id is attributed to the subagent_type of the launching Agent call', () => {
  const { lines } = parseTrace(REAL);
  const idx = attributionIndex(lines);
  assert.deepEqual([...new Set(idx.values())], ['ai-flow:explorer', 'ai-flow:proposer', 'ai-flow:specifier', 'ai-flow:designer', 'ai-flow:planner', 'ai-flow:implementer', 'ai-flow:verifier', 'ai-flow:archivist']);
  const implId = [...idx].find(([, v]) => v === 'ai-flow:implementer')[0];
  const sub = lines.find((l) => l.parent_tool_use_id === implId);
  assert.equal(agentOf(sub, idx), 'ai-flow:implementer');
  assert.equal(agentOf(lines.find((l) => l.type === 'assistant' && !l.parent_tool_use_id), idx), 'main');
  assert.equal(lines.filter((l) => l.parent_tool_use_id && agentOf(l, idx) === 'unknown').length, 0);
});

test('task_started alone is enough to attribute a sidechain', () => {
  const idx = attributionIndex([{ type: 'system', subtype: 'task_started', tool_use_id: 'toolu_Z', subagent_type: 'ai-flow:planner' }]);
  assert.equal(idx.get('toolu_Z'), 'ai-flow:planner');
});

test('vitest summaries classify as red/green and npm module errors as env_error', () => {
  assert.equal(classifyTestRun(RED), 'red');
  assert.equal(classifyTestRun(' Test Files  1 failed (1)\n      Tests  no tests\n'), 'red');
  assert.equal(classifyTestRun(GREEN), 'green');
  assert.equal(classifyTestRun("Error: Cannot find module '/x/.nvm/versions/node/v26.5.0/bin/npm'"), 'env_error');
  assert.equal(classifyTestRun('hello'), null);
});

test('test files are test/**/*.test.js or *.test.*; impl files are src/** excluding tests', () => {
  assert.ok(isTestFile('test/slugify.test.js'));
  assert.ok(isTestFile('src/slugify.test.mjs'));
  assert.ok(!isTestFile('src/slugify.js'));
  assert.ok(isImplFile('src/slugify.js'));
  assert.ok(!isImplFile('src/slugify.test.js'));
  assert.ok(!isImplFile('README.md'));
});

test('TDD: test write -> red -> impl write -> green passes with ratio 1 (REQ-007 S1, real tracer run)', () => {
  const { tdd } = analyzeTrace(REAL);
  assert.equal(tdd.applicable, true);
  assert.equal(tdd.pass, true);
  assert.equal(tdd.ratio, 1);
  assert.deepEqual(tdd.impl_changes.map((c) => [c.file, c.agent]), [['src/slugify.js', 'ai-flow:implementer']]);
  assert.equal(tdd.env_errors, 0);
});

test('TDD: impl-first fails and the reason names the impl file (REQ-007 S2)', () => {
  const p = 'toolu_I';
  const t = trace([
    [use('Agent', { subagent_type: 'ai-flow:implementer' }, null, p)],
    [use('Edit', { file_path: `${CWD}/src/slugify.js` }, p), 'ok'],
    [use('Bash', { command: 'npm test' }, p), GREEN],
    [use('Write', { file_path: `${CWD}/test/slugify.test.js` }, p), 'ok'],
    [use('Bash', { command: 'npm test' }, p), GREEN],
  ]);
  const { tdd } = analyzeTrace(t);
  assert.equal(tdd.pass, false);
  assert.equal(tdd.ratio, 0);
  assert.match(tdd.reason, /src\/slugify\.js/);
});

// Task 2.9 (REQ-011 S2-S3; user decision 2026-10-18): per-phase tokens come from task_notification usage;
// the sum check against the run total is informational (coverage ratio), never a failure.
import { makeFixture } from '../scripts/make-fixture.mjs';

test('S2: per_phase has one entry per agent type from task_notification usage, plus main from the trace', () => {
  const a = analyzeTrace(REAL);
  assert.equal(a.per_phase_source, 'task_notification');
  const types = Object.keys(a.per_phase).filter((k) => k !== 'main').sort();
  assert.deepEqual(types, ['ai-flow:archivist', 'ai-flow:designer', 'ai-flow:explorer', 'ai-flow:implementer', 'ai-flow:planner', 'ai-flow:proposer', 'ai-flow:specifier', 'ai-flow:verifier']);
  assert.deepEqual(a.per_phase['ai-flow:implementer'], { instances: 1, tokens_total: 41930, tokens_notification: 41930, tokens_trace: a.per_phase['ai-flow:implementer'].tokens_trace, tool_uses: 20, duration_ms: 72731 });
  assert.ok(a.per_phase['ai-flow:implementer'].tokens_trace > 0);
  assert.ok(a.per_phase.main.tokens_total > 0);
  const sum = Object.values(a.per_phase).reduce((s, p) => s + p.tokens_total, 0);
  assert.equal(a.per_phase_coverage, Math.round((sum / a.tokens.total) * 1000) / 1000);
  assert.ok(a.per_phase_coverage > 0 && a.per_phase_coverage < 1, 'informational coverage ratio, not a pass/fail check');
  assert.equal(a.per_phase_reason, null);
});

test('S3: more than 1% unparseable lines gives per_phase null with a reason; totals still come from result.modelUsage', () => {
  const a = analyzeTrace(fs.readFileSync(path.join(TRACES, 'corrupt.jsonl'), 'utf8'));
  assert.ok(a.parse_errors > 0);
  assert.equal(a.per_phase, null);
  assert.match(a.per_phase_reason, /unparseable/);
  assert.equal(a.tokens.source, 'result.modelUsage');
  assert.equal(a.tokens.total, 1507169);
});

test('S3: a corrupt trace without a parseable result line reports tokens.source "unavailable" and total null (no guesses)', () => {
  const noResult = fs.readFileSync(path.join(TRACES, 'corrupt.jsonl'), 'utf8').split('\n').filter((l) => !l.startsWith('{"type":"result"')).join('\n');
  const a = analyzeTrace(noResult);
  assert.equal(a.tokens.source, 'unavailable');
  assert.equal(a.tokens.total, null);
  assert.equal(a.per_phase, null);
});

test('sidechains without any task_notification usage give per_phase null with a reason', () => {
  const stripped = REAL.split('\n').filter((l) => !l.includes('"subtype":"task_notification"')).join('\n');
  const a = analyzeTrace(stripped);
  assert.equal(a.per_phase, null);
  assert.match(a.per_phase_reason, /task_notification/);
});

test('corrupt.jsonl is what make-fixture derives from real-case-a', () => {
  assert.equal(fs.readFileSync(path.join(TRACES, 'corrupt.jsonl'), 'utf8'), makeFixture(REAL, 'corrupt'));
});

// Task 2.13 (REQ-012 as_shipped, REQ-013 S4, REQ-005 S1, REQ-006 S3).
test('as-shipped SessionStart on v3.4.0: hook error, exit 126, 0 injected tokens', () => {
  const { session_start } = analyzeTrace(REAL);
  assert.deepEqual(session_start, { hook_outcome: 'error', exit_code: 126, stdout_chars: 0, injected_tokens_est: 0 });
});

test('a successful hook reports its stdout size and a token estimate', () => {
  const ok = [{ type: 'system', subtype: 'hook_response', hook_event: 'SessionStart', outcome: 'success', exit_code: 0, stdout: 'x'.repeat(400) }].map((l) => JSON.stringify(l)).join('\n');
  assert.deepEqual(analyzeTrace(ok).session_start, { hook_outcome: 'success', exit_code: 0, stdout_chars: 400, injected_tokens_est: 100 });
});

test('env: only ai-flow plus builtin plugins, and the only MCP server is the engram mock', () => {
  const { env } = analyzeTrace(REAL);
  assert.equal(env.plugins[0], 'ai-flow');
  assert.equal(env.plugins_clean, true);
  assert.deepEqual(env.mcp_servers, ['plugin_engram_engram']);
  assert.equal(env.mcp_mock_only, true);
  assert.equal(env.contamination, false);
  assert.equal(env.acceptance_peek, false);
  assert.equal(env.model, 'claude-sonnet-5-5');
});

test('contamination is flagged when a sentinel line appears in the trace', () => {
  const { env } = analyzeTrace(REAL, { sentinels: ['Base directory for this skill'] });
  assert.equal(env.contamination, true);
  assert.deepEqual(env.contamination_hits, ['Base directory for this skill']);
});

test('acceptance_peek is flagged when any Read targets *.accept.test.js', () => {
  const peek = REAL.trimEnd() + '\n' + JSON.stringify({ type: 'assistant', parent_tool_use_id: null, message: { id: 'm_peek', content: [{ type: 'tool_use', id: 't_peek', name: 'Read', input: { file_path: '/x/acceptance/slugify.accept.test.js' } }] } }) + '\n';
  assert.equal(analyzeTrace(peek).env.acceptance_peek, true);
});

test('a non-builtin extra plugin or a non-mock MCP server breaks the clean-config check', () => {
  const lines = REAL.trim().split('\n').map((l) => JSON.parse(l));
  const init = lines.find((l) => l.subtype === 'init');
  init.plugins.push({ name: 'user-plugin', path: '/HOME/.claude/plugins/x', source: 'user-plugin@market' });
  init.mcp_servers.push({ name: 'engram', status: 'connected', source: 'user' });
  const { env } = analyzeTrace(lines.map((l) => JSON.stringify(l)).join('\n'));
  assert.equal(env.plugins_clean, false);
  assert.equal(env.mcp_mock_only, false);
});
