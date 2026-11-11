// Task 1.1 (REQ-008, REQ-010; D13): agent role / phase config is the single source for the graders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, roles } from '../lib/config.mjs';
import { PLUGIN_DIR } from '../lib/paths.mjs';

const cfg = loadConfig();

test('readOnlyAgents is exactly the six read-only phase agents', () => {
  assert.deepEqual([...cfg.readOnlyAgents].sort(), ['archivist', 'designer', 'explorer', 'planner', 'proposer', 'specifier']);
});

test('noWriteAgents is readOnlyAgents plus verifier', () => {
  assert.deepEqual([...cfg.noWriteAgents].sort(), [...cfg.readOnlyAgents, 'verifier'].sort());
});

test('phaseMap maps the 8 DAG phase agents; orchestrator, initializer and debugger map to null', () => {
  // Plan said "9 phase agents": 11 agents minus initializer/debugger. orchestrator has no DAG phase (it is the
  // main-thread role when launched as a subagent), so it maps to null too.
  const phased = Object.entries(cfg.phaseMap).filter(([, v]) => v !== null).map(([k]) => k).sort();
  assert.deepEqual(phased, ['archivist', 'designer', 'explorer', 'implementer', 'planner', 'proposer', 'specifier', 'verifier']);
  assert.equal(cfg.phaseMap.orchestrator, null);
  assert.equal(cfg.phaseMap.initializer, null);
  assert.equal(cfg.phaseMap.debugger, null);
  assert.equal(cfg.phaseMap.implementer, 'apply');
  assert.equal(cfg.phaseMap.planner, 'plan');
});

test('gates are proposal, plan, tracer, verify; write tools are Write/Edit/NotebookEdit/MultiEdit', () => {
  assert.deepEqual(cfg.gates, ['proposal', 'plan', 'tracer', 'verify']);
  assert.deepEqual([...cfg.writeTools].sort(), ['Edit', 'MultiEdit', 'NotebookEdit', 'Write']);
});

test('dagEdges reference only phases from phaseMap', () => {
  const phases = new Set(Object.values(cfg.phaseMap).filter(Boolean));
  for (const [from, to] of cfg.dagEdges) {
    assert.ok(phases.has(from), from);
    assert.ok(phases.has(to), to);
  }
});

test('every agent named in the config exists as plugins/ai-flow/agents/<name>.md', () => {
  const names = new Set([...cfg.readOnlyAgents, ...cfg.noWriteAgents, ...Object.keys(cfg.phaseMap)]);
  for (const n of names) assert.ok(fs.existsSync(path.join(PLUGIN_DIR, 'agents', `${n}.md`)), n);
});

test('roles() strips the plugin prefix from subagent_type and answers role questions', () => {
  const r = roles(cfg);
  assert.equal(r.shortName('ai-flow:planner'), 'planner');
  assert.equal(r.shortName('planner'), 'planner');
  assert.equal(r.isReadOnly('ai-flow:specifier'), true);
  assert.equal(r.isReadOnly('ai-flow:verifier'), false);
  assert.equal(r.isNoWrite('ai-flow:verifier'), true);
  assert.equal(r.phaseOf('ai-flow:designer'), 'design');
  assert.equal(r.phaseOf('general-purpose'), null);
  assert.equal(r.isWriteTool('NotebookEdit'), true);
  assert.equal(r.isWriteTool('mcp__plugin_engram_engram__mem_save'), false);
});

test('B2b: self_delegation is a lower-is-better count metric and gateBaseline.default resolves to v3.4.0-<model>.json (D6, D8)', () => {
  assert.deepEqual(cfg.metrics.self_delegation, { better: 'lower', rate: false });
  assert.equal(cfg.gateBaseline.default.replace('{model}', 'sonnet'), 'v3.4.0-sonnet.json');
});

// B4 Task 3.4 (REQ-013 S2, R6, R12): the four B4 metrics are informational and stay out of the D-2 blocking set.
const D2_BLOCKING = ['outcome_pass_rate', 'tdd_score', 'tdd_ratio', 'phase_order', 'artifact_completeness', 'tokens_total', 'cost_usd', 'wall_time_s', 'subagent_ask', 'readonly_writes', 'per_phase_tokens', 'self_delegation'];
const B4_METRICS = ['routing_coverage', 'orchestrator_delegation', 'main_phase_skill_loads', 'tdd_instance'];

test('B4: the four new metrics have a direction and are flagged informational', () => {
  assert.deepEqual(cfg.metrics.routing_coverage, { better: 'higher', rate: true, informational: true });
  assert.deepEqual(cfg.metrics.orchestrator_delegation, { better: 'lower', rate: false, informational: true });
  assert.deepEqual(cfg.metrics.main_phase_skill_loads, { better: 'lower', rate: false, informational: true });
  assert.deepEqual(cfg.metrics.tdd_instance, { better: 'higher', rate: true, informational: true });
});

test('B4: the blocking metric set (not informational) is unchanged from D-2 and excludes the B4 metrics', () => {
  const blocking = Object.entries(cfg.metrics).filter(([, s]) => !s.informational).map(([k]) => k);
  assert.deepEqual(blocking.sort(), [...D2_BLOCKING].sort());
  for (const m of B4_METRICS) assert.ok(!blocking.includes(m), m);
});
