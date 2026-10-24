// B2b nested capture (design D1-D4): CLI subagent transcripts merged into the trace, graded at any depth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle, mergeNested } from '../lib/nested.mjs';
import { parseTrace } from '../lib/trace.mjs';

const NESTED = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'nested');
const PROBE = path.join(NESTED, 'probe-depth3');

test('loadBundle reads probe-depth3 agents with spawnDepth 1, 2 and 3', () => {
  const b = loadBundle(PROBE);
  assert.equal(b.source, 'bundle');
  assert.equal(b.agents.length, 3);
  assert.deepEqual(b.agents.map((a) => a.meta.spawnDepth).sort(), [1, 2, 3]);
  assert.ok(b.agents.every((a) => a.lines.length > 0 && a.lines.every((l) => l.type === 'user' || l.type === 'assistant')));
  assert.equal(b.mockCalls.length, 2);
});

const probeTrace = () => parseTrace(fs.readFileSync(path.join(PROBE, 'trace.jsonl'), 'utf8')).lines;
const OUTER = 'toolu_01L4RHfPyGqD9FUu1rXnK7zT';
const MIDDLE = 'toolu_01Jpa6hGjabnk2Y6rRAUyqcV';
const LEAF = 'toolu_013AFnUVtXyz4mU3mTjri6ZP';
const toolUseIds = (l) => (Array.isArray(l.message?.content) ? l.message.content : []).filter((c) => c.type === 'tool_use').map((c) => c.id);
const resultIds = (l) => (Array.isArray(l.message?.content) ? l.message.content : []).filter((c) => c.type === 'tool_result').map((c) => c.tool_use_id);

test('mergeNested on probe-depth3: capture complete, expected = captured = 3, nothing missing (REQ-002 S1)', () => {
  const { capture } = mergeNested(probeTrace(), loadBundle(PROBE));
  assert.equal(capture.status, 'complete');
  assert.equal(capture.expected, 3);
  assert.equal(capture.captured, 3);
  assert.deepEqual(capture.missing, []);
});

test('mergeNested tags transcript lines with parent_tool_use_id and agent_depth and splices them before the launching Agent tool_result (D3, E7)', () => {
  const { lines } = mergeNested(probeTrace(), loadBundle(PROBE));
  const leafLines = lines.filter((l) => l.parent_tool_use_id === LEAF);
  assert.ok(leafLines.length > 0);
  assert.ok(leafLines.every((l) => l.agent_depth === 3 && l.agent_id === 'a656004d8a3b2961b'));
  const lastLeaf = lines.lastIndexOf(leafLines.at(-1));
  const leafResult = lines.findIndex((l) => l.type === 'user' && resultIds(l).includes(LEAF));
  assert.ok(leafResult > lastLeaf, 'leaf lines come before the Agent tool_result that ends the leaf launch');
  assert.equal(lines[leafResult].parent_tool_use_id, MIDDLE, 'that tool_result is in the middle agent stream');
  const middleResult = lines.findIndex((l) => l.type === 'user' && resultIds(l).includes(MIDDLE));
  assert.equal(lines[middleResult].parent_tool_use_id, OUTER);
  assert.ok(middleResult > leafResult);
});

test('mergeNested counts a depth-1 event present in both the trace sidechain and its transcript once (REQ-003 S3)', () => {
  const { lines } = mergeNested(probeTrace(), loadBundle(PROBE));
  const occurrences = lines.flatMap(toolUseIds).filter((id) => id === MIDDLE).length;
  assert.equal(occurrences, 1);
  assert.ok(lines.some((l) => l.parent_tool_use_id === OUTER && l.type === 'assistant' && Array.isArray(l.message.content) && l.message.content.some((c) => c.type === 'text')), 'the outer final text missing from the trace comes from its transcript (E5)');
});

test('mergeNested drops the depth-1 trace sidechain even when the CLI tags those lines with agent_id (live CLI 2.1.309)', () => {
  const trace = probeTrace().map((l) => (l.parent_tool_use_id === OUTER ? { ...l, agent_id: 'a4adf29f0230e3c1e' } : l));
  const { lines } = mergeNested(trace, loadBundle(PROBE));
  assert.equal(lines.flatMap(toolUseIds).filter((id) => id === MIDDLE).length, 1);
});

test('mergeNested builds the agent tree with depth and launched_by (REQ-001 S2)', () => {
  const { tree } = mergeNested(probeTrace(), loadBundle(PROBE));
  const simple = tree.map(({ tool_use_id, agent, depth, launched_by }) => ({ tool_use_id, agent, depth, launched_by }));
  assert.deepEqual(simple, [
    { tool_use_id: OUTER, agent: 'probe:outer', depth: 1, launched_by: 'main' },
    { tool_use_id: MIDDLE, agent: 'probe:middle', depth: 2, launched_by: OUTER },
    { tool_use_id: LEAF, agent: 'probe:leaf', depth: 3, launched_by: MIDDLE },
  ]);
  assert.ok(tree.every((t) => t.source === 'transcript'));
});

test('analyzeTrace accepts {bundle} and returns nested_capture (tracer, REQ-002)', async () => {
  const { analyzeTrace } = await import('../analyze.mjs');
  const a = analyzeTrace(fs.readFileSync(path.join(PROBE, 'trace.jsonl'), 'utf8'), { caseName: 'probe', bundle: loadBundle(PROBE) });
  assert.equal(a.nested_capture?.status, 'complete');
});

const analyzeDir = async (dir, caseName) => {
  const { analyzeTrace } = await import('../analyze.mjs');
  return analyzeTrace(fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8'), { caseName, bundle: loadBundle(dir) });
};
const notObservable = (r) => typeof r === 'string' && r.startsWith('not observable');

test('probe: the depth-3 leaf Write is attributed to probe:leaf at depth 3, and no grade is "not observable" (REQ-003 S1, REQ-018 S1)', async () => {
  const { toolCalls } = await import('../lib/trace.mjs');
  const { lines } = mergeNested(probeTrace(), loadBundle(PROBE));
  const write = toolCalls(lines).find((c) => c.name === 'Write' && c.input.file_path.endsWith('/leaf.txt'));
  assert.equal(write.agent, 'probe:leaf');
  assert.equal(write.instance, LEAF);
  assert.equal(lines.find((l) => (Array.isArray(l.message?.content) ? l.message.content : []).some((c) => c.id === write.id)).agent_depth, 3);
  const a = await analyzeDir(PROBE, 'probe');
  assert.equal(a.tool_use.unobserved_subagents, undefined);
  assert.equal(a.tool_use.unknown_attribution, 0);
  assert.ok(!notObservable(a.tdd.reason), a.tdd.reason);
  assert.ok(!notObservable(a.artifacts.reason), a.artifacts.reason);
});

test('mini-tdd: implementer at depth 2 writes the test, sees red, then implements: TDD applicable and passing (REQ-004 S1)', async () => {
  const a = await analyzeDir(path.join(NESTED, 'mini-tdd'), 'a');
  assert.equal(a.nested_capture.status, 'complete');
  assert.equal(a.tdd.applicable, true, a.tdd.reason);
  assert.equal(a.tdd.pass, true, a.tdd.reason);
  assert.deepEqual(a.tdd.impl_changes.map((c) => [c.file, c.agent]), [['src/x.js', 'ai-flow:implementer']]);
});

test('live-a fixture (real delegated case a run on 8029d9b): capture complete, TDD applicable, implementer at depth 2 (REQ-001, REQ-004 S1)', async () => {
  const dir = path.join(NESTED, 'live-a');
  const a = await analyzeDir(dir, 'a-e2e-bugfix-slugify');
  assert.equal(a.nested_capture.status, 'complete', JSON.stringify(a.nested_capture));
  assert.equal(a.tdd.applicable, true, a.tdd.reason);
  assert.ok(a.agent_tree.some((t) => /implementer$/.test(t.agent) && t.depth === 2), JSON.stringify(a.agent_tree));
});

// B2b Task 1.3 (REQ-015): fixture tooling and the synthetic delegated-e2e fixture.
const E2E = path.join(NESTED, 'delegated-e2e');
const filesOf = (dir) => fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort();

test('make-nested-fixture on the committed probe-depth3 bundle is idempotent (output == committed fixture)', async () => {
  const { tmpDir } = await import('./helpers.mjs');
  const { makeNestedFixture } = await import('../scripts/make-nested-fixture.mjs');
  const out = path.join(tmpDir(), 'probe');
  makeNestedFixture(PROBE, out);
  assert.deepEqual(filesOf(out), filesOf(PROBE));
  for (const f of filesOf(PROBE)) assert.equal(fs.readFileSync(path.join(out, f), 'utf8'), fs.readFileSync(path.join(PROBE, f), 'utf8'), f);
});

test('the delegated-e2e builder reproduces the committed fixture byte for byte', async () => {
  const { tmpDir } = await import('./helpers.mjs');
  const { buildDelegatedE2e } = await import('./fixtures/nested/build-delegated-e2e.mjs');
  const out = path.join(tmpDir(), 'e2e');
  buildDelegatedE2e(out);
  assert.deepEqual(filesOf(out), filesOf(E2E));
  for (const f of filesOf(E2E)) assert.equal(fs.readFileSync(path.join(out, f), 'utf8'), fs.readFileSync(path.join(E2E, f), 'utf8'), f);
});

test('delegated-e2e: capture complete over 9 agents (orchestrator, 7 phase agents, debugger) with max depth 3', async () => {
  const a = await analyzeDir(E2E, 'a-e2e');
  assert.equal(a.nested_capture.status, 'complete', JSON.stringify(a.nested_capture));
  assert.equal(a.nested_capture.expected, 9);
  assert.equal(Math.max(...a.agent_tree.map((t) => t.depth)), 3);
  assert.equal(a.agent_tree.find((t) => t.depth === 3).agent, 'ai-flow:debugger');
});

test('mutateBundle({drop: "planner"}) copies the fixture and removes only the planner transcript', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const dir = mutateBundle(E2E, { drop: 'planner' });
  assert.notEqual(dir, E2E);
  assert.equal(fs.readdirSync(path.join(dir, 'subagents')).filter((f) => f.endsWith('.jsonl')).length, 8);
  assert.ok(!loadBundle(dir).agents.some((x) => x.meta.agentType === 'ai-flow:planner'));
  assert.equal(loadBundle(E2E).agents.length, 9, 'the committed fixture is untouched');
});

// B2b Task 2.1 (REQ-002 S2/S3, REQ-001 S3, REQ-003 S2 relaxed per R6): capture variants.
const e2eTrace = () => parseTrace(fs.readFileSync(path.join(E2E, 'trace.jsonl'), 'utf8')).lines;
const mergeDir = (dir, trace = e2eTrace()) => mergeNested(trace, loadBundle(dir));

test('zero launches: capture not_applicable and retainBundle creates no subagents dir (REQ-001 S3)', async () => {
  const { tmpDir } = await import('./helpers.mjs');
  const { retainBundle } = await import('../lib/nested.mjs');
  const trace = [{ type: 'system', subtype: 'init', cwd: '/w', session_id: 's0' }, { type: 'assistant', message: { id: 'm', content: [{ type: 'text', text: 'hi' }] } }];
  const { capture } = mergeNested(trace, { agents: [], mockCalls: [], errors: [], source: 'kept' });
  assert.equal(capture.status, 'not_applicable');
  assert.equal(capture.expected, 0);
  const kept = tmpDir();
  fs.mkdirSync(path.join(kept, 'out'));
  fs.writeFileSync(path.join(kept, 'out', 'trace.jsonl'), trace.map((l) => JSON.stringify(l)).join('\n'));
  const dest = path.join(tmpDir(), 'a-0');
  retainBundle(kept, 's0', dest, { tracePath: path.join(kept, 'out', 'trace.jsonl') });
  assert.equal(fs.existsSync(path.join(dest, 'subagents')), false);
});

test('one transcript missing (planner): capture partial, missing names the launch, its launcher and depth, reason names planner (REQ-002 S2)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const { capture } = mergeDir(mutateBundle(E2E, { drop: 'planner' }));
  assert.equal(capture.status, 'partial');
  assert.equal(capture.expected, 9);
  assert.equal(capture.captured, 8);
  assert.deepEqual(capture.missing, [{ tool_use_id: 'toolu_PLAN', agent: 'ai-flow:planner', launched_by: 'toolu_ORCH', depth: 2 }]);
  assert.match(capture.reason, /planner/);
});

test('no subagents dir while launches are expected: capture failed "no subagent transcripts found at <path>" with no home path (REQ-002 S3)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const dir = mutateBundle(E2E);
  fs.rmSync(path.join(dir, 'subagents'), { recursive: true });
  const { capture } = mergeDir(dir);
  assert.equal(capture.status, 'failed');
  assert.equal(capture.transcripts, 0);
  assert.equal(capture.captured, 1, 'only the depth-1 orchestrator, through its trace sidechain');
  assert.match(capture.reason, /^no subagent transcripts found at \S+subagents/);
  assert.ok(!/\/Users\//.test(capture.reason), capture.reason);
});

test('every transcript unparseable: capture failed with a parse error reason (REQ-002 S3)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const { capture } = mergeDir(mutateBundle(E2E, { corrupt: 'all' }));
  assert.equal(capture.status, 'failed');
  assert.match(capture.reason, /parse error/);
  assert.equal(capture.missing.length, 8, 'the depth-1 orchestrator is still seen through its trace sidechain');
});

test('orphan transcript (toolUseId matches no launch): merged, attributed via meta.agentType with orphan:true and listed; status over expected only (R6)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const { toolCalls } = await import('../lib/trace.mjs');
  const { lines, capture } = mergeDir(mutateBundle(E2E, { orphan: true }));
  assert.equal(capture.status, 'complete');
  assert.equal(capture.expected, 9);
  assert.deepEqual(capture.orphans, [{ agent_id: 'aorphan', agent: 'ai-flow:explorer', tool_use_id: 'toolu_ORPHAN', depth: 2 }]);
  const read = toolCalls(lines).find((c) => c.id === 'toolu_ORPH_R1');
  assert.equal(read.agent, 'ai-flow:explorer');
  assert.ok(lines.filter((l) => l.parent_tool_use_id === 'toolu_ORPHAN').every((l) => l.orphan === true));
});

test('a trace sidechain tool_use missing from the transcript: union without duplicates and capture.inconsistent (D3)', () => {
  const trace = e2eTrace();
  const at = trace.findIndex((l) => l.type === 'user' && l.parent_tool_use_id === 'toolu_ORCH');
  trace.splice(at + 1, 0, { type: 'assistant', parent_tool_use_id: 'toolu_ORCH', message: { id: 'aorch-x', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_EXTRA', name: 'Read', input: { file_path: '/w/a' } }], usage: { input_tokens: 1, output_tokens: 1 } } });
  const { lines, capture } = mergeNested(trace, loadBundle(E2E));
  assert.equal(capture.status, 'complete');
  assert.deepEqual(capture.inconsistent, [{ tool_use_id: 'toolu_ORCH', agent_id: 'aorch', trace_only_lines: 1 }]);
  const ids = lines.flatMap(toolUseIds);
  assert.equal(ids.filter((id) => id === 'toolu_EXTRA').length, 1);
  assert.equal(ids.filter((id) => id === 'toolu_PROP').length, 1);
});

// B2b Task 2.2 (REQ-005 S1-S3, REQ-018 S1/S2, REQ-020): applyCapture n/a reasons and na_cause.
const analyzeBundle = async (dir, caseName = 'a-e2e') => {
  const { analyzeTrace } = await import('../analyze.mjs');
  return analyzeTrace(fs.readFileSync(path.join(E2E, 'trace.jsonl'), 'utf8'), { caseName, bundle: loadBundle(dir) });
};

test('failed capture: tdd, artifacts and tool_use are n/a with "capture failed:" and na_cause capture (REQ-005 S1)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const a = await analyzeBundle(mutateBundle(E2E, { corrupt: 'all' }));
  assert.equal(a.nested_capture.status, 'failed');
  for (const g of [a.tdd, a.artifacts, a.tool_use]) {
    assert.equal(g.applicable, false);
    assert.match(g.reason, /^capture failed: parse error/);
    assert.equal(g.na_cause, 'capture');
  }
  assert.equal(a.tdd.pass, null);
  assert.equal(a.artifacts.score, null);
});

test('complete capture without implementation changes: TDD keeps its intrinsic reason, na_cause intrinsic (REQ-005 S2)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const dir = mutateBundle(E2E);
  const f = path.join(dir, 'subagents', 'agent-aimpl.jsonl');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/toolu_IW[12]/.test(l)).join('\n'));
  const a = await analyzeBundle(dir);
  assert.equal(a.nested_capture.status, 'complete');
  assert.equal(a.tdd.applicable, false);
  assert.equal(a.tdd.reason, 'no implementation changes');
  assert.equal(a.tdd.na_cause, 'intrinsic');
});

test('partial capture missing only a no-write agent (archivist): TDD and artifacts graded with capture_note, tool_use n/a "capture partial: missing archivist" (REQ-005 S3)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const a = await analyzeBundle(mutateBundle(E2E, { drop: 'archivist' }));
  assert.equal(a.nested_capture.status, 'partial');
  assert.equal(a.tdd.applicable, true);
  assert.equal(a.tdd.pass, true);
  assert.equal(a.tdd.capture_note, 'capture partial: missing archivist');
  assert.equal(a.artifacts.applicable, true);
  assert.equal(a.artifacts.score, 1);
  assert.equal(a.artifacts.capture_note, 'capture partial: missing archivist');
  assert.equal(a.tool_use.applicable, false);
  assert.equal(a.tool_use.reason, 'capture partial: missing archivist');
  assert.equal(a.tool_use.na_cause, 'capture');
});

test('partial capture missing an artifact owner (planner): artifacts n/a "capture partial: missing planner"; TDD still graded', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const a = await analyzeBundle(mutateBundle(E2E, { drop: 'planner' }));
  assert.equal(a.artifacts.applicable, false);
  assert.equal(a.artifacts.reason, 'capture partial: missing planner');
  assert.equal(a.artifacts.na_cause, 'capture');
  assert.equal(a.tdd.applicable, true);
});

test('partial capture missing the implementer: TDD n/a "capture partial: missing implementer" (its debugger transcript is still captured)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const a = await analyzeBundle(mutateBundle(E2E, { drop: 'implementer' }));
  assert.equal(a.tdd.applicable, false);
  assert.equal(a.tdd.reason, 'capture partial: missing implementer');
  assert.equal(a.tdd.na_cause, 'capture');
});

test('no grade of a complete run (delegated-e2e, live-a, probe) says "not observable" (REQ-018 S1)', async () => {
  for (const [dir, cs] of [[E2E, 'a-e2e'], [path.join(NESTED, 'live-a'), 'a-e2e-bugfix-slugify'], [PROBE, 'probe']]) {
    const a = await analyzeDir(dir, cs);
    assert.equal(a.nested_capture.status, 'complete');
    assert.ok(!JSON.stringify([a.tdd, a.artifacts, a.tool_use]).includes('not observable'), dir);
  }
});

test('analysis without a bundle carries nested_capture too: a flat trace with depth-1 sidechains only is complete (REQ-020, REQ-004 S6)', async () => {
  const { analyzeTrace } = await import('../analyze.mjs');
  const a = analyzeTrace(fs.readFileSync(path.join(NESTED, '..', 'traces', 'real-case-a.jsonl'), 'utf8'), { caseName: 'a-e2e-bugfix-slugify' });
  assert.ok(['complete', 'not_applicable'].includes(a.nested_capture.status), JSON.stringify(a.nested_capture));
  assert.equal(a.tdd.na_cause ?? null, a.tdd.applicable ? null : 'intrinsic');
});

// B2b Task 2.3 (REQ-004 S2-S5): graders see depth-2 work. Each test also runs a seeded negative: the same grade
// over the merged stream with attribution stripped (every line on the main thread) must differ.
const unattributed = async (dir) => {
  const { toolCalls } = await import('../lib/trace.mjs');
  const { lines } = mergeDir(dir);
  return toolCalls(lines.map(({ parent_tool_use_id, agent_type, ...l }) => l));
};

test('impl-first at depth 2: tdd.pass false and the reason names the implementer (REQ-004 S2)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const { gradeTdd, tddEvents } = await import('../lib/tdd.mjs');
  const dir = mutateBundle(E2E, { implFirst: true });
  const a = await analyzeBundle(dir);
  assert.equal(a.tdd.applicable, true);
  assert.equal(a.tdd.pass, false);
  assert.match(a.tdd.reason, /impl-first by ai-flow:implementer: src\/slug\.js/);
  assert.doesNotMatch(gradeTdd(tddEvents(await unattributed(dir), '/w')).reason, /implementer/, 'seeded negative: without attribution the reason cannot name the implementer');
});

test('planner at depth 2 calls AskUserQuestion: subagent_ask 1 attributed to planner (REQ-004 S3)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const { gradeToolUse } = await import('../lib/tooluse.mjs');
  const dir = mutateBundle(E2E, { ask: true });
  const a = await analyzeBundle(dir);
  assert.equal(a.tool_use.subagent_ask.total, 1);
  assert.deepEqual(a.tool_use.subagent_ask.by_agent, { planner: 1 });
  assert.equal(gradeToolUse(await unattributed(dir), (await import('../lib/config.mjs')).loadConfig()).subagent_ask.total, 0, 'seeded negative');
});

test('specifier at depth 2 writes a repo file: readonly_writes 1 attributed to specifier (REQ-004 S4)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const { gradeToolUse } = await import('../lib/tooluse.mjs');
  const dir = mutateBundle(E2E, { readonlyWrite: true });
  const a = await analyzeBundle(dir);
  assert.equal(a.tool_use.readonly_writes.total, 1);
  assert.deepEqual(a.tool_use.readonly_writes.calls, [{ agent: 'specifier', tool: 'Write', path: 'docs/spec.md' }]);
  assert.equal(gradeToolUse(await unattributed(dir), (await import('../lib/config.mjs')).loadConfig()).readonly_writes.total, 0, 'seeded negative');
});

test('mem_save of proposal, spec, design and plan by depth-2 agents: artifacts applicable, score 1 (REQ-004 S5)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const a = await analyzeBundle(E2E);
  assert.equal(a.artifacts.applicable, true);
  assert.equal(a.artifacts.score, 1);
  assert.deepEqual(a.artifacts.missing, []);
  const noPayloads = mutateBundle(E2E);
  for (const id of ['aprop', 'aspec', 'ades', 'aplan']) {
    const f = path.join(noPayloads, 'subagents', `agent-${id}.jsonl`);
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split('\n').filter((l) => !l.includes('mem_save')).join('\n'));
  }
  assert.equal((await analyzeBundle(noPayloads)).artifacts.score, 0, 'seeded negative: the score comes from the depth-2 payloads');
});

// B2b Task 2.4 (REQ-006, design D5) + tracer-gate decision TG1 (gate markers echoed across streams count once).
const phaseView = (p) => ({ launched: p.launched.map((l) => l.agent), gates: p.gates.map((g) => g.gate), order_ok: p.order_ok, violations: p.order_violations });

/** main -> orchestrator -> orchestrator (self-delegation) -> the phase agents (depth 3) -> debugger (depth 4). */
async function selfDelegatedChain() {
  const { mutateBundle } = await import('./helpers.mjs');
  const dir = mutateBundle(E2E);
  const sub = path.join(dir, 'subagents');
  const orch = fs.readFileSync(path.join(sub, 'agent-aorch.jsonl'), 'utf8');
  fs.writeFileSync(path.join(sub, 'agent-aorch2.jsonl'), orch);
  fs.writeFileSync(path.join(sub, 'agent-aorch2.meta.json'), JSON.stringify({ agentType: 'ai-flow:orchestrator', toolUseId: 'toolu_ORCH2', parentAgentId: 'aorch', spawnDepth: 2, finished: true }));
  const step = (o) => JSON.stringify({ parent_tool_use_id: null, isSidechain: true, ...o });
  fs.writeFileSync(path.join(sub, 'agent-aorch.jsonl'), [
    step({ type: 'user', message: { role: 'user', content: 'go' } }),
    step({ type: 'assistant', message: { id: 'aorch-s1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_ORCH2', name: 'Agent', input: { subagent_type: 'ai-flow:orchestrator', prompt: 'go' } }], usage: { input_tokens: 1, output_tokens: 1 } } }),
    step({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_ORCH2', content: 'flow complete' }] } }),
  ].join('\n') + '\n');
  // The trace's depth-1 sidechain slice (E5) now belongs to the inner orchestrator: drop it.
  const trace = path.join(dir, 'trace.jsonl');
  fs.writeFileSync(trace, fs.readFileSync(trace, 'utf8').split('\n').filter((l) => !l.includes('"parent_tool_use_id":"toolu_ORCH"')).join('\n'));
  for (const f of fs.readdirSync(sub).filter((x) => x.endsWith('.meta.json') && !/aorch2?\./.test(x))) {
    const m = JSON.parse(fs.readFileSync(path.join(sub, f), 'utf8'));
    fs.writeFileSync(path.join(sub, f), JSON.stringify({ ...m, parentAgentId: m.parentAgentId === 'aorch' ? 'aorch2' : m.parentAgentId, spawnDepth: m.spawnDepth + 1 }));
  }
  return dir;
}

const PHASE_SEQ = ['proposer', 'specifier', 'designer', 'planner', 'implementer', 'verifier', 'archivist'];

test('delegated-e2e: phase order is graded from the depth-2 sequence and its four gates (REQ-006 S1)', async () => {
  const p = phaseView((await analyzeBundle(E2E)).phases);
  assert.deepEqual(p, { launched: ['orchestrator', ...PHASE_SEQ], gates: ['proposal', 'plan', 'tracer', 'verify'], order_ok: true, violations: [] });
});

test('implementer -> debugger at depth 3: the debugger is in the agent tree and does not change phase order (REQ-006 S2)', async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const a = await analyzeBundle(E2E);
  assert.ok(a.agent_tree.some((t) => t.agent === 'ai-flow:debugger' && t.depth === 3 && t.launched_by === 'toolu_IMPL'));
  assert.deepEqual(phaseView(a.phases), phaseView((await analyzeBundle(mutateBundle(E2E, { drop: 'debugger' }))).phases));
});

test('a self-delegated chain main -> orchestrator -> orchestrator -> phases is still graded (D5)', async () => {
  const dir = await selfDelegatedChain();
  const { analyzeTrace } = await import('../analyze.mjs');
  const a = analyzeTrace(fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8'), { caseName: 'a-e2e', bundle: loadBundle(dir) });
  assert.equal(a.nested_capture.status, 'complete', JSON.stringify(a.nested_capture.missing));
  assert.deepEqual(phaseView(a.phases), { launched: ['orchestrator', 'orchestrator', ...PHASE_SEQ], gates: ['proposal', 'plan', 'tracer', 'verify'], order_ok: true, violations: [] });
});

test('live-a: gate markers the main thread echoes from the orchestrator count once: 4 gates, not 8 (TG1)', async () => {
  const a = await analyzeDir(path.join(NESTED, 'live-a'), 'a-e2e-bugfix-slugify');
  assert.deepEqual(a.phases.gates.map((g) => g.gate), ['proposal', 'plan', 'tracer', 'verify']);
});

test('TG6: a contamination sentinel that appears only in a nested transcript is flagged; acceptance peeks at depth 2 too', async () => {
  const { analyzeTrace } = await import('../analyze.mjs');
  const text = fs.readFileSync(path.join(E2E, 'trace.jsonl'), 'utf8');
  const env = analyzeTrace(text, { caseName: 'a-e2e', bundle: loadBundle(E2E), sentinels: ['## Testing Strategy'] }).env;
  assert.equal(env.contamination, true);
  assert.deepEqual(env.contamination_hits, ['## Testing Strategy']);
  assert.equal(analyzeTrace(text, { caseName: 'a-e2e', bundle: loadBundle(E2E), sentinels: ['never-there-sentinel'] }).env.contamination, false);
});

test('TG2: per_agent_tokens_transcript sums the merged transcript tokens per agent type (informational, apart from task_notification per_phase)', async () => {
  const { assembleRunMetrics } = await import('../lib/metrics.mjs');
  const a = await analyzeBundle(E2E);
  assert.equal(a.per_agent_tokens_transcript['ai-flow:implementer'], 6 * 15);
  assert.equal(a.per_agent_tokens_transcript['ai-flow:debugger'], 2 * 15);
  assert.equal(a.per_agent_tokens_transcript.main, 2 * 15);
  assert.equal(a.per_phase['ai-flow:implementer'].tokens_total, 100, 'per_phase stays task_notification-based');
  const m = assembleRunMetrics({ caseName: 'a-e2e', index: 0, run: {}, analysis: a, outcome: { pass: true } });
  assert.deepEqual(m.per_agent_tokens_transcript, a.per_agent_tokens_transcript);
});
