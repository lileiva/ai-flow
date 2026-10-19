// Batch 5 defects D2/D3 (P5.1 live, claude 2.1.302): in 4 of 9 e2e runs the main thread handed the flow to an
// ai-flow:orchestrator subagent, which launched the phase agents as NESTED subagents. The trace keeps the
// orchestrator sidechain (its Agent launches and gate text) but not the nested agents' own messages.
//  D2: phase order is graded on the delegated orchestrator's launches and gates (it was vacuously true).
//  D3: TDD, artifacts and tool-use are not observable in such a run: n/a with a reason, never 0 or "no changes".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTrace } from '../analyze.mjs';
import { summarize } from '../summarize.mjs';
import { unobservedSubagents } from '../lib/trace.mjs';

const agent = (id, type) => ({ type: 'tool_use', id, name: 'Agent', input: { subagent_type: type, prompt: 'p' } });
const text = (t) => ({ type: 'text', text: t });
const msg = (parent, ...content) => ({ type: 'assistant', parent_tool_use_id: parent, message: { id: `m${Math.random()}`, role: 'assistant', content, usage: { input_tokens: 1, output_tokens: 1 } } });

function delegatedTrace(order = ['proposer', 'specifier', 'designer', 'planner', 'implementer', 'verifier', 'archivist']) {
  const gateAfter = { proposer: 'proposal', planner: 'plan', implementer: 'tracer', verifier: 'verify' };
  const lines = [{ type: 'system', subtype: 'init', cwd: '/w' }, msg(null, agent('orc', 'ai-flow:orchestrator'))];
  for (const a of order) {
    lines.push(msg('orc', agent(`n-${a}`, `ai-flow:${a}`)));
    lines.push({ type: 'system', subtype: 'task_started', tool_use_id: `n-${a}`, subagent_type: `ai-flow:${a}` });
    if (gateAfter[a]) lines.push(msg('orc', text(`AUTO-APPROVED GATE: ${gateAfter[a]}`)));
  }
  lines.push(msg(null, text('done')), { type: 'result', subtype: 'success', total_cost_usd: 1 });
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

test('unobservedSubagents lists Agent launches whose sidechain never appears in the trace', () => {
  const lines = delegatedTrace().trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(unobservedSubagents(lines).map((s) => s.agent), ['ai-flow:proposer', 'ai-flow:specifier', 'ai-flow:designer', 'ai-flow:planner', 'ai-flow:implementer', 'ai-flow:verifier', 'ai-flow:archivist']);
});

test('a launch that never started (no task_started, e.g. an unknown agent type) is not an unobserved subagent', () => {
  const lines = [msg(null, agent('orc', 'ai-flow:orchestrator')), msg('orc', agent('bad', 'explorer')), msg('orc', text('x'))];
  assert.deepEqual(unobservedSubagents(lines), []);
});

test('[phase-order] D2: a delegated orchestrator is graded on its own launches and gates', () => {
  const p = analyzeTrace(delegatedTrace(), { caseName: 'a-e2e-bugfix-slugify' }).phases;
  assert.equal(p.delegated_to, 'orchestrator');
  assert.deepEqual(p.launched.map((l) => l.agent), ['orchestrator', 'proposer', 'specifier', 'designer', 'planner', 'implementer', 'verifier', 'archivist']);
  assert.equal(p.order_ok, true, p.order_violations.join('; '));
});

test('D2: a delegated orchestrator that launches the implementer before the planner fails', () => {
  const p = analyzeTrace(delegatedTrace(['proposer', 'specifier', 'designer', 'implementer', 'planner', 'verifier', 'archivist']), { caseName: 'a-e2e-bugfix-slugify' }).phases;
  assert.equal(p.order_ok, false);
  assert.ok(p.order_violations.includes('apply before plan'), p.order_violations.join('; '));
});

test('D3: TDD, artifacts and tool-use are n/a (not observable) when nested subagents ran outside the trace', () => {
  const a = analyzeTrace(delegatedTrace(), { caseName: 'a-e2e-bugfix-slugify' });
  assert.equal(a.tdd.applicable, false);
  assert.match(a.tdd.reason, /not observable: 7 nested subagent/);
  assert.equal(a.artifacts.applicable, false);
  assert.equal(a.artifacts.score, null);
  assert.match(a.artifacts.reason, /not observable/);
  assert.equal(a.tool_use.unobserved_subagents, 7);
});

test('D3: summarize excludes unobservable tool-use counts (n/a instead of a false 0)', () => {
  const META = { plugin_version: '3.4.0', plugin_ref: 'v3.4.0', plugin_sha: 'abc', claude_version: '2.1.302', model: 'sonnet', judge_model: 'haiku', date: '2026-10-18T00:00:00Z', runs_per_case: 1, cap_usd: null, cases_run: ['a'], complete: true, incomplete_reason: null, total_cost_usd: 1 };
  const tool = (unobserved) => ({ subagent_ask: { total: 0, by_agent: {} }, readonly_writes: { total: 0, by_agent: {} }, unknown_attribution: 0, unobserved_subagents: unobserved });
  const run = (i, unobserved) => ({ case: 'a', run_index: i, harness_error: false, tokens: { total: 1 }, outcome: { pass: true }, cli: { costUsd: 1, durationSeconds: 1 }, tdd: { applicable: false, pass: null, ratio: null }, tool_use: tool(unobserved) });
  const s = summarize([run(0, 7), run(1, 0)], META);
  assert.equal(s.cases.a.subagent_ask.n_applicable, 1);
  assert.equal(s.cases.a.readonly_writes.n_applicable, 1);
});
