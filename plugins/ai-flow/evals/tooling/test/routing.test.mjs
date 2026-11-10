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

test('analyzeTrace result has routing.routing_coverage', () => {
  const a = analyzeTrace(read('tdd-test-first'));
  assert.ok(a.routing, 'routing block present');
  assert.ok('routing_coverage' in a.routing, 'routing_coverage key present');
});
