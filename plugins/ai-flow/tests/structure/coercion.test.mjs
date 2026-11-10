// Coercion lint (REQ-010 S2/S3): runtime markdown and the decoded hook output are written in plain, reasoned
// language. The rollout is scoped (R15): SCOPE lists the files checked now; Task 4.1 widens it to the full tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, listRuntimeMd } from '../lib/plugin-files.mjs';
import { HOOK_TARGET, collectLintTargets, lintCoercion, unusedAllowlistEntries } from '../lib/coercion-lint.mjs';

test('lint walks runtime markdown and lists files checked', () => {
  const targets = collectLintTargets();
  assert.ok(targets.length > 0);
  const names = targets.map((t) => t.file);
  assert.ok(names.includes('skills/using-ai-flow/SKILL.md'));
  assert.ok(names.includes('hooks/session-start (decoded output)'));
  assert.deepEqual(names.filter((n) => n.endsWith('.md')).sort(), listRuntimeMd());
  assert.equal(typeof lintCoercion, 'function');
});

// Seeded violations, one hit each (the banned list lives in tests/lib/coercion-lint.mjs).
const COERCION_FIXTURE = ['NEVER do X', '<EXTREMELY_IMPORTANT>', 'Iron Law', 'violation of this rule', '**MUST** run'];

test('seeded negatives: each coercive line produces exactly 1 hit', () => {
  for (const seed of COERCION_FIXTURE) {
    assert.equal(lintCoercion(`Some prose.\n${seed}\nMore prose.\n`, 'seed.md').length, 1, seed);
  }
});

test('text inside code fences produces 0 hits', () => {
  const fenced = ['```', ...COERCION_FIXTURE, '```'].join('\n');
  assert.deepEqual(lintCoercion(fenced, 'seed.md'), []);
});

test('plain prose with reasons produces 0 hits', () => {
  assert.deepEqual(lintCoercion('Run the test first, because a test never seen failing proves nothing.\n', 'ok.md'), []);
});

test('allowlist: an entry without a reason throws', () => {
  assert.throws(() => lintCoercion('NEVER do X\n', 'a.md', [{ file: 'a.md', linePattern: /NEVER/, reason: '' }]), /no reason/);
  assert.throws(() => unusedAllowlistEntries([], [{ file: 'a.md', linePattern: /NEVER/ }]), /no reason/);
});

test('allowlist: an entry with a reason suppresses its line only', () => {
  const allow = [{ file: 'a.md', linePattern: /^CRITICAL:/, reason: 'severity label' }];
  const text = 'CRITICAL: a finding\nNEVER do X\n';
  assert.equal(lintCoercion(text, 'a.md', allow).length, 1);
});

test('allowlist: an unused entry fails', () => {
  const allow = [
    { file: 'a.md', linePattern: /^CRITICAL:/, reason: 'severity label' },
    { file: 'a.md', linePattern: /^WARNING:/, reason: 'stale: no such line any more' },
  ];
  const stale = unusedAllowlistEntries([{ file: 'a.md', text: 'CRITICAL: a finding\n' }], allow);
  assert.deepEqual(stale.map((e) => e.reason), ['stale: no such line any more']);
});

// Rollout is scoped (R15). Each de-coercion task adds its files here; Task 4.1 replaces this with the full tree.
const SCOPE = [HOOK_TARGET, 'skills/flow-apply/SKILL.md', 'agents/explorer.md', 'agents/proposer.md', 'agents/specifier.md', 'agents/designer.md'];
// Entries need {file, linePattern, reason}; an unused entry fails.
const ALLOWLIST = [
  {
    file: 'agents/specifier.md',
    linePattern: /^- \*\*MUST \/ SHALL:\*\*/,
    reason: 'RFC 2119 keyword definition: MUST/SHALL is the vocabulary the specifier teaches for writing requirements, not an instruction to the agent',
  },
];

test('SCOPE files have 0 coercion hits', () => {
  const byFile = new Map(collectLintTargets().map((t) => [t.file, t]));
  const hits = SCOPE.flatMap((f) => {
    assert.ok(byFile.has(f), `SCOPE names a file the walker does not list: ${f}`);
    return lintCoercion(byFile.get(f).text, f, ALLOWLIST);
  });
  assert.deepEqual(hits, []);
});

test('the project allowlist has no unused entries', () => {
  const targets = collectLintTargets().filter((t) => SCOPE.includes(t.file));
  assert.deepEqual(unusedAllowlistEntries(targets, ALLOWLIST), []);
});

// Rules survive (REQ-011 S1): de-coercing must not drop the hard rules. Each marker is looked up inside the
// agent's "## Rules" section. Only agents in RULES_SCOPE are asserted now; each rewrite task adds its agent (R15).
const SUBAGENT_RULES = { 'do not ask the user': /do not ask the user/i, 'return open_questions': /open_questions/i };
const RULES = {
  implementer: {
    'failing test before code, per task': /failing test before (writing )?(any )?(the )?(production )?code/i,
    'return blocked instead of guessing': /return (status )?blocked instead of guessing/i,
  },
  debugger: {
    'root cause before fix': /root cause before (a |any )?fix/i,
    'reproduce with a failing test first': /reproduce[^.\n]*failing test first/i,
  },
  verifier: {
    'do not modify source files': /do not modify source files/i,
    'verdict from evidence': /verdict[^.\n]*from evidence/i,
  },
};
const NO_WRITE_RULE = { 'do not create, edit or delete project files': /do not create, edit or delete project files/i };
const READ_ONLY_RULE = { 'persist via engram or the shared fallback': /persist[^.\n]*engram[^.\n]*fallback/i };
const NO_WRITE_AGENTS = ['explorer', 'designer', 'proposer', 'specifier', 'planner', 'archivist', 'verifier'];
const RULES_SCOPE = ['implementer', 'explorer', 'proposer', 'specifier', 'designer'];

const rulesSection = (text) => /^## Rules\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? '';
const rulesFor = (agent) => ({
  ...SUBAGENT_RULES,
  ...(RULES[agent] ?? {}),
  ...(NO_WRITE_AGENTS.includes(agent) ? NO_WRITE_RULE : {}),
  ...(NO_WRITE_AGENTS.includes(agent) && agent !== 'verifier' ? READ_ONLY_RULE : {}),
});
/** Names of the required rules that the agent text does not state inside its Rules section. */
const missingRules = (text, agent) => {
  const section = rulesSection(text);
  return Object.entries(rulesFor(agent)).filter(([, re]) => !re.test(section)).map(([name]) => name);
};
const agentText = (agent) => fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', `${agent}.md`), 'utf8');

for (const agent of RULES_SCOPE) {
  for (const name of Object.keys(rulesFor(agent))) {
    test(`rules survive: ${agent} states "${name}"`, () => {
      assert.ok(!missingRules(agentText(agent), agent).includes(name));
    });
  }
}

test('negative: an implementer copy without the failing-test rule fails the rules check', () => {
  const copy = agentText('implementer').split('\n').filter((l) => !/failing test before/i.test(l)).join('\n');
  assert.ok(missingRules(copy, 'implementer').includes('failing test before code, per task'));
});
