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
