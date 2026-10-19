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
