// Task 3.1 (REQ-013 S1 routing_coverage, REQ-003 S3 metric). Informational: not in the D-2 blocking set (R6, R12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTrace } from '../analyze.mjs';

const TRACES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'traces');
const read = (name) => fs.readFileSync(path.join(TRACES, `${name}.jsonl`), 'utf8');

const launch = (id, input, parent = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { id: `m-${id}`, role: 'assistant', content: [{ type: 'tool_use', id, name: 'Agent', input }], usage: { input_tokens: 1, output_tokens: 1 } } });
const toTrace = (lines) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
const coverage = (lines) => analyzeTrace(toTrace(lines)).routing.routing_coverage;

test('routing-ok: 3 coordinator launches of ai-flow:* with model and effort give coverage 1', () => {
  const r = analyzeTrace(read('routing-ok')).routing;
  assert.equal(r.routing_coverage, 1);
  assert.equal(r.launches, 3);
});

test('routing-missing: 1 of 2 launches lacks effort, coverage 0.5', () => {
  const r = analyzeTrace(read('routing-missing')).routing;
  assert.equal(r.routing_coverage, 0.5);
  assert.deepEqual(r.unrouted.map((u) => u.agent), ['ai-flow:implementer']);
});

test('non-ai-flow subagent_types are ignored', () => {
  const ok = { model: 'sonnet', effort: 'low' };
  assert.equal(coverage([launch('a', { subagent_type: 'ai-flow:explorer', ...ok }), launch('b', { subagent_type: 'general-purpose' }), launch('c', { subagent_type: 'Explore' })]), 1);
});

test('no coordinator launches of ai-flow agents gives null', () => {
  assert.equal(coverage([launch('b', { subagent_type: 'general-purpose' })]), null);
  assert.equal(coverage([]), null);
});

test('a launch from inside a phase agent (nested, not the coordinator) is not counted', () => {
  const lines = [launch('a', { subagent_type: 'ai-flow:planner', model: 'opus', effort: 'high' }), launch('n', { subagent_type: 'ai-flow:debugger' }, 'a')];
  assert.equal(coverage(lines), 1);
});

test('legacy trace: the delegated orchestrator is the coordinator, its launches count', () => {
  const lines = [launch('o', { subagent_type: 'ai-flow:orchestrator' }), launch('p', { subagent_type: 'ai-flow:planner', model: 'opus', effort: 'high' }, 'o')];
  // main launched the orchestrator without routing (miss); the orchestrator's launch is routed
  assert.equal(coverage(lines), 0.5);
});

test('empty model or effort strings do not count as routed', () => {
  assert.equal(coverage([launch('a', { subagent_type: 'ai-flow:planner', model: '', effort: 'high' })]), 0);
});

// Task 3.2 (REQ-013 S1, REQ-006 S2, REQ-008 S2). Informational metrics.
const skill = (id, name, parent = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { id: `m-${id}`, role: 'assistant', content: [{ type: 'tool_use', id, name: 'Skill', input: { skill: name } }], usage: { input_tokens: 1, output_tokens: 1 } } });
const routing = (lines) => analyzeTrace(toTrace(lines)).routing;

test('coordinator-main fixture: no orchestrator delegation, no phase-skill loads (coordinator skills are not phase skills)', () => {
  const r = analyzeTrace(read('coordinator-main')).routing;
  assert.equal(r.orchestrator_delegation, 0);
  assert.equal(r.main_phase_skill_loads, 0);
  assert.equal(r.routing_coverage, 1);
});

test('an ai-flow:orchestrator launch gives orchestrator_delegation 1', () => {
  assert.equal(routing([launch('o', { subagent_type: 'ai-flow:orchestrator' })]).orchestrator_delegation, 1);
});

test('an orchestrator launch nested at depth is still counted', () => {
  const lines = [launch('a', { subagent_type: 'ai-flow:planner' }), launch('o', { subagent_type: 'ai-flow:orchestrator' }, 'a')];
  assert.equal(routing(lines).orchestrator_delegation, 1);
});

test('a main Skill load of ai-flow:flow-apply gives main_phase_skill_loads 1', () => {
  assert.equal(routing([skill('s', 'ai-flow:flow-apply')]).main_phase_skill_loads, 1);
});

test('Skill loads of using-ai-flow, coordinating-apply and coordinating-commands are not phase-skill loads', () => {
  const lines = ['ai-flow:using-ai-flow', 'ai-flow:coordinating-apply', 'ai-flow:coordinating-commands'].map((n, i) => skill(`s${i}`, n));
  assert.equal(routing(lines).main_phase_skill_loads, 0);
});

test('a phase-skill load inside a phase agent (not the coordinator) is not counted', () => {
  const lines = [launch('a', { subagent_type: 'ai-flow:implementer' }), skill('s', 'ai-flow:flow-verify', 'a')];
  assert.equal(routing(lines).main_phase_skill_loads, 0);
});

test('no lines: both counts are 0', () => {
  const r = routing([]);
  assert.equal(r.orchestrator_delegation, 0);
  assert.equal(r.main_phase_skill_loads, 0);
});

const TRACER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'results', '2026-11-06T16-36-46-574Z', 'traces', 'd-0', 'trace.jsonl');
test('real tracer trace d-0: orchestrator_delegation 0, main_phase_skill_loads 0', { skip: fs.existsSync(TRACER) ? false : 'tracer bundle 2026-11-06T16-36-46-574Z not present' }, () => {
  const r = analyzeTrace(fs.readFileSync(TRACER, 'utf8')).routing;
  assert.equal(r.orchestrator_delegation, 0);
  assert.equal(r.main_phase_skill_loads, 0);
});

test('analyzeTrace result has routing.routing_coverage', () => {
  const a = analyzeTrace(read('tdd-test-first'));
  assert.ok(a.routing, 'routing block present');
  assert.ok('routing_coverage' in a.routing, 'routing_coverage key present');
});
