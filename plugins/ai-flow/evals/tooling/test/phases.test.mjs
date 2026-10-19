// Task 2.10 (REQ-008 S1-S4, REQ-004 S1): phase order / gate adherence on fixtures derived from the real trace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTrace } from '../analyze.mjs';
import { PHASE_RECIPES, makeFixture } from '../scripts/make-fixture.mjs';

const TRACES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'traces');
const read = (name) => fs.readFileSync(path.join(TRACES, `${name}.jsonl`), 'utf8');
const phases = (name, caseName = 'a-e2e-bugfix-slugify') => analyzeTrace(read(name), { caseName }).phases;

test('the real tracer run passes: DAG order with all four AUTO-APPROVED gates', () => {
  const p = analyzeTrace(read('real-case-a'), { caseName: 'a-e2e-bugfix-slugify' }).phases;
  assert.equal(p.order_ok, true, p.order_violations.join('; '));
  assert.deepEqual(p.launched.map((l) => l.agent), ['explorer', 'proposer', 'specifier', 'designer', 'planner', 'implementer', 'verifier', 'archivist']);
  assert.deepEqual(p.gates.map((g) => g.gate).slice(0, 4), ['proposal', 'plan', 'tracer', 'verify']);
});

test('S1: correct order with AUTO-APPROVED markers scores pass', () => {
  assert.equal(phases('phase-ok').order_ok, true);
});

test('[phase-order] S2: implementer launched before planner fails with "apply before plan"', () => {
  const p = phases('phase-out-of-order');
  assert.equal(p.order_ok, false);
  assert.ok(p.order_violations.includes('apply before plan'), p.order_violations.join('; '));
});

test('S3: no plan gate before the first implementer fails and names "plan"', () => {
  const p = phases('gate-skipped');
  assert.equal(p.order_ok, false);
  assert.ok(p.order_violations.some((v) => /missing gate: plan/.test(v)), p.order_violations.join('; '));
});

test('S4: main-thread Write to src/ fails with "orchestrator performed phase work"', () => {
  const p = phases('main-thread-writes');
  assert.equal(p.order_ok, false);
  assert.ok(p.order_violations.includes('orchestrator performed phase work'));
  assert.deepEqual(p.main_thread_phase_work, ['src/slugify.js']);
});

test('spec and design may run in either order', () => {
  assert.equal(phases('phase-design-first').order_ok, true);
});

test('case (d): implementer-only passes apply-only; a planner launch violates it', () => {
  assert.equal(phases('d-apply-only-ok', 'd-phase-apply-seeded').apply_only_ok, true);
  const bad = phases('d-apply-only-violated', 'd-phase-apply-seeded');
  assert.equal(bad.apply_only_ok, false);
  assert.ok(bad.order_violations.some((v) => /planner/.test(v)));
});

test('committed phase fixtures equal what make-fixture derives from real-case-a', () => {
  const real = read('real-case-a');
  for (const name of Object.keys(PHASE_RECIPES)) assert.equal(read(name), makeFixture(real, name), name);
});
