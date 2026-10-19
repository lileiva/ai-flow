// P4.6: verdicts on real live traces (sonnet, plugin-ref v3.4.0, claude 2.1.302), trimmed with scripts/trim-trace.mjs.
// The analyzer must reach the same verdicts offline as it did on the untrimmed live traces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTrace } from '../analyze.mjs';

const TRACES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'traces');
const read = (name) => fs.readFileSync(path.join(TRACES, `${name}.jsonl`), 'utf8');

test('[phase-order] real case (e): propose, spec, design, plan in order; stops at the plan gate; no implementer', () => {
  const a = analyzeTrace(read('real-case-e'), { caseName: 'e-phase-propose-plan-seeded' });
  assert.deepEqual(a.phases.launched.map((l) => l.agent), ['proposer', 'specifier', 'designer', 'planner']);
  assert.deepEqual(a.phases.gates.map((g) => g.gate), ['proposal', 'plan']);
  assert.equal(a.phases.order_ok, true);
  assert.deepEqual(a.phases.main_thread_phase_work, []);
  assert.match(a.last_main_text, /STOPPED AT GATE: plan/);
  assert.equal(a.tdd.applicable, false);
  assert.equal(a.tool_use.subagent_ask.total, 0);
  assert.equal(a.tool_use.readonly_writes.total, 0);
  assert.equal(a.session_start.exit_code, 126);
});

test('real case (e): all four artifacts are complete (artifact grader on a real trimmed trace)', () => {
  const a = analyzeTrace(read('real-case-e'), { caseName: 'e-phase-propose-plan-seeded' });
  assert.equal(a.artifacts.applicable, true);
  assert.equal(a.artifacts.score, 1);
  for (const k of ['proposal', 'spec', 'design', 'plan']) assert.equal(a.artifacts[k].present, true, k);
});

test('real case (d): only the implementer ran (apply_only_ok), no gates, no subagent questions', () => {
  const a = analyzeTrace(read('real-case-d'), { caseName: 'd-phase-apply-seeded' });
  assert.deepEqual(a.phases.launched.map((l) => l.agent), ['implementer']);
  assert.equal(a.phases.apply_only_ok, true);
  assert.equal(a.tool_use.subagent_ask.total, 0);
  assert.equal(a.tool_use.readonly_writes.total, 0);
});

test('[SC3-test-first] real case (d): filtered red runs count; every impl change was test-first with red seen', () => {
  const a = analyzeTrace(read('real-case-d'), { caseName: 'd-phase-apply-seeded' });
  assert.equal(a.tdd.applicable, true);
  assert.equal(a.tdd.pass, true);
  assert.equal(a.tdd.ratio, 1);
  assert.deepEqual(a.tdd.impl_changes.map((c) => c.file), ['src/word-count.js', 'src/index.js', 'src/reading-time.js']);
});

test('real case (d): seeded artifacts were fetched by id through the case fixed mocks', () => {
  const lines = read('real-case-d').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const gets = lines.flatMap((o) => (o.type === 'assistant' ? o.message.content : [])).filter((c) => c.type === 'tool_use' && c.name.endsWith('__mem_get_observation'));
  assert.ok(gets.length >= 3, `mem_get_observation calls: ${gets.length}`);
  const results = lines.flatMap((o) => (o.type === 'user' && Array.isArray(o.message?.content) ? o.message.content : []))
    .filter((c) => c.type === 'tool_result' && gets.some((g) => g.id === c.tool_use_id))
    .map((c) => (typeof c.content === 'string' ? c.content : c.content.map((x) => x.text ?? '').join('')));
  assert.ok(results.some((t) => /add-reading-time/.test(t)), 'fixture content returned (not the suite agent mock)');
});

// P5.1 (sonnet, v3.4.0, claude 2.1.302) live traces behind defects D1-D3, trimmed with scripts/trim-trace.mjs.
test('[SC3-test-first] real case (a), P5.1 run 2: Bash-only edits (heredoc/python/sed) are graded test-first (D1)', () => {
  const a = analyzeTrace(read('real-case-a-bash'), { caseName: 'a-e2e-bugfix-slugify' });
  assert.equal(a.tdd.applicable, true);
  assert.equal(a.tdd.pass, true, a.tdd.reason);
  assert.deepEqual(a.tdd.impl_changes.map((c) => c.file), ['src/slugify.js']);
  assert.deepEqual(a.phases.launched.map((l) => l.agent), ['explorer', 'proposer', 'specifier', 'designer', 'planner', 'implementer', 'verifier', 'archivist']);
  assert.deepEqual(a.phases.order_violations, ['missing gate: tracer']);
});

test('[phase-order] real case (b), P5.1 run 1: the flow delegated to ai-flow:orchestrator is graded on its launches (D2)', () => {
  const a = analyzeTrace(read('real-case-b-delegated'), { caseName: 'b-e2e-feature-truncate-words' });
  assert.equal(a.phases.delegated_to, 'orchestrator');
  assert.ok(a.phases.launched.length > 1, 'nested phase launches are visible');
  assert.ok(a.phases.launched.some((l) => l.phase === 'apply'));
  assert.equal(a.phases.order_ok, false);
  assert.ok(a.phases.order_violations.includes('missing gate: tracer'), a.phases.order_violations.join('; '));
});

test('real case (b), P5.1 run 1: nested subagents ran outside the trace, so TDD/artifacts/tool-use are n/a (D3)', () => {
  const a = analyzeTrace(read('real-case-b-delegated'), { caseName: 'b-e2e-feature-truncate-words' });
  assert.equal(a.tdd.applicable, false);
  assert.match(a.tdd.reason, /not observable: \d+ nested subagent/);
  assert.equal(a.artifacts.applicable, false);
  assert.ok(a.tool_use.unobserved_subagents > 0);
});
