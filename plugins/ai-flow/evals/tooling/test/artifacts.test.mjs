// Task 2.11 (REQ-009 S1-S3): artifact completeness from mem_save/mem_update inputs and subagent hand-backs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTrace } from '../analyze.mjs';
import { missingSections } from '../lib/artifacts.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const md = (n) => fs.readFileSync(path.join(FIX, 'artifacts', `${n}.md`), 'utf8');
const trace = (n) => fs.readFileSync(path.join(FIX, 'traces', `${n}.jsonl`), 'utf8');

test('S1: a complete proposal has no missing sections', () => {
  assert.deepEqual(missingSections('proposal', md('proposal-complete')), []);
});

test('S2: a proposal without rollback reports missing ["rollback"]', () => {
  assert.deepEqual(missingSections('proposal', md('proposal-no-rollback')), ['rollback']);
});

test('headings match case-insensitively; spec needs requirement ids and Given/When/Then; design and plan sections', () => {
  assert.deepEqual(missingSections('proposal', md('proposal-complete').toUpperCase()), []);
  assert.deepEqual(missingSections('spec', '### REQ-001: x\nGiven a\nWhen b\nThen c'), []);
  assert.deepEqual(missingSections('spec', '## Requirements\nThe thing works.'), ['requirement ids', 'given/when/then']);
  assert.deepEqual(missingSections('design', '## Decisions\n## File Changes\n## Testing Strategy'), []);
  assert.deepEqual(missingSections('plan', '## Tasks\n### Task 1\n## Tracer Bullet\n## Batches'), []);
  assert.deepEqual(missingSections('plan', '## Tasks'), ['tracer bullet', 'batches']);
});

test('S3: case (e) ending without a plan reports "plan: missing" and scores below 1', () => {
  const a = analyzeTrace(trace('d-apply-only-ok'), { caseName: 'e-phase-propose-plan-seeded' });
  assert.equal(a.artifacts.plan.present, false);
  assert.ok(a.artifacts.missing.includes('plan: missing'));
  assert.ok(a.artifacts.score < 1);
});

test('the real tracer run produced all four artifacts (text from mem_save inputs and hand-backs)', () => {
  const a = analyzeTrace(trace('real-case-a'), { caseName: 'a-e2e-bugfix-slugify' });
  for (const k of ['proposal', 'spec', 'design', 'plan']) assert.equal(a.artifacts[k].present, true, k);
  assert.equal(typeof a.artifacts.score, 'number');
});

test('case (d) expects no artifacts: completeness is n/a', () => {
  const a = analyzeTrace(trace('d-apply-only-ok'), { caseName: 'd-phase-apply-seeded' });
  assert.equal(a.artifacts.applicable, false);
  assert.equal(a.artifacts.score, null);
});
