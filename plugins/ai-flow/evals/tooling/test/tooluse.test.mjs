// Task 2.12 (REQ-010 S1-S5): tool-use graders with per-agent attribution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTrace } from '../analyze.mjs';
import { TOOLUSE_RECIPES, makeFixture } from '../scripts/make-fixture.mjs';

const TRACES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'traces');
const read = (name) => fs.readFileSync(path.join(TRACES, `${name}.jsonl`), 'utf8');
const tu = (name) => analyzeTrace(read(name), { caseName: 'a-e2e-bugfix-slugify' }).tool_use;

test('S1 + S4: the real run (implementer writes, designer mem_save) counts 0 subagent asks and 0 read-only writes', () => {
  const t = tu('real-case-a');
  assert.equal(t.subagent_ask.total, 0);
  assert.equal(t.readonly_writes.total, 0);
  assert.equal(t.unknown_attribution, 0);
});

test('[subagent-ask] S2: an explorer AskUserQuestion attempt counts 1 for explorer, even when rejected as an unknown tool', () => {
  const t = tu('subagent-ask');
  assert.equal(t.subagent_ask.total, 1);
  assert.deepEqual(t.subagent_ask.by_agent, { explorer: 1 });
});

test('[readonly-write] S3: a specifier Write counts 1 for specifier with the file path', () => {
  const t = tu('readonly-write');
  assert.equal(t.readonly_writes.total, 1);
  assert.deepEqual(t.readonly_writes.by_agent, { specifier: 1 });
  assert.deepEqual(t.readonly_writes.calls, [{ agent: 'specifier', tool: 'Write', path: 'docs/spec.md' }]);
});

test('a verifier Edit is counted; verifier Bash is not', () => {
  const t = tu('verifier-edit');
  assert.deepEqual(t.readonly_writes.by_agent, { verifier: 1 });
  assert.equal(t.readonly_writes.calls[0].tool, 'Edit');
});

test('S5: calls in a nested sidechain are attributed to its agent type; orphans count as unknown and are reported', () => {
  const t = tu('nested-sidechain');
  assert.equal(t.unknown_attribution, 1);
  assert.deepEqual(t.subagent_ask.by_agent, { 'general-purpose': 1, unknown: 1 });
});

test('committed tool-use fixtures equal what make-fixture derives from real-case-a', () => {
  const real = read('real-case-a');
  for (const name of Object.keys(TOOLUSE_RECIPES)) assert.equal(read(name), makeFixture(real, name), name);
});

// B2b Task 2.5 (REQ-007 S1-S3, design D6): self-delegation at any depth, from the agent tree.
const NESTED_DIR = new URL('./fixtures/nested/', import.meta.url).pathname;
async function analyzeE2e(mutation) {
  const fs = await import('node:fs');
  const { analyzeTrace } = await import('../analyze.mjs');
  const { loadBundle } = await import('../lib/nested.mjs');
  const { mutateBundle } = await import('./helpers.mjs');
  const src = `${NESTED_DIR}delegated-e2e`;
  const dir = mutation ? mutateBundle(src, mutation) : src;
  return analyzeTrace(fs.readFileSync(`${dir}/trace.jsonl`, 'utf8'), { caseName: 'a-e2e', bundle: loadBundle(dir) });
}

test('self_delegation: main -> orchestrator -> phase agents has none (REQ-007 S1)', async () => {
  assert.deepEqual((await analyzeE2e()).tool_use.self_delegation, { count: 0, launches: [] });
});

test('self_delegation: orchestrator (depth 1) launching ai-flow:orchestrator is counted at depth 2 (REQ-007 S2)', async () => {
  assert.deepEqual((await analyzeE2e({ selfDelegate: true })).tool_use.self_delegation, { count: 1, launches: [{ agent: 'orchestrator', depth: 2, launched_by: 'orchestrator' }] });
});

test('self_delegation is n/a under failed capture, never 0 (REQ-007 S3)', async () => {
  const a = await analyzeE2e({ corrupt: 'all' });
  assert.equal(a.tool_use.self_delegation, 'n/a');
  assert.match(a.tool_use.reason, /^capture failed:/);
});

test('self_delegation counts implementer -> implementer at depth 3; main is never a launcher', async () => {
  const { selfDelegation } = await import('../lib/tooluse.mjs');
  const { loadConfig } = await import('../lib/config.mjs');
  const tree = [
    { tool_use_id: 'o', agent: 'ai-flow:orchestrator', depth: 1, launched_by: 'main' },
    { tool_use_id: 'i', agent: 'ai-flow:implementer', depth: 2, launched_by: 'o' },
    { tool_use_id: 'i2', agent: 'ai-flow:implementer', depth: 3, launched_by: 'i' },
  ];
  assert.deepEqual(selfDelegation(tree, loadConfig()), { count: 1, launches: [{ agent: 'implementer', depth: 3, launched_by: 'implementer' }] });
});
