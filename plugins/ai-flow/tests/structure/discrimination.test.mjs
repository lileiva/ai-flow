// Discrimination audit (REQ-008 S1): every B2 check has a negative test that runs it on a seeded violation.
// Also: main is untouched by B2 (REQ-022 S2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, REPO_ROOT } from '../lib/plugin-files.mjs';

const STRUCTURE = path.join(PLUGIN_ROOT, 'tests', 'structure');

// check id -> [test file, exact title of its negative test]
const CHECKS = {
  'REQ-002 validate catches a malformed manifest': ['run-sh.test.mjs', 'negative: claude plugin validate fails on a temp copy with a malformed plugin.json'],
  'REQ-003 runtime shape': ['frontmatter.test.mjs', 'negative: shape rule flags stray runtime files and directories'],
  'REQ-003 frontmatter name == dir': ['frontmatter.test.mjs', 'negative: a skill whose name differs from its directory is flagged'],
  'REQ-004 READ_REF integrity': ['references.test.mjs', 'negative: a dangling READ_REF is reported with file, line and missing target'],
  'REQ-005 relative path lint': ['references.test.mjs', 'relative agents/ or skills/ path is flagged with its line; ${CLAUDE_PLUGIN_ROOT}/ paths are not'],
  'REQ-005 allowlist needs a reason': ['references.test.mjs', 'negative: an allowlist entry without a reason throws'],
  'REQ-006 bare prefix lint': ['references.test.mjs', 'bare /flow-<x> command is flagged with its line; a plain word flow-apply is not'],
  'REQ-007 version consistency': ['docs.test.mjs', 'negative: a marketplace still on 4.0.0-alpha.1 is flagged naming both values'],
  'REQ-009 engram fallback single source': ['single-source.test.mjs', 'negative: an agent copy that still carries the old fallback paragraph is flagged'],
  'REQ-009 engram fallback content': ['single-source.test.mjs', 'negative: an engram-fallback doc without the orchestrator section or the hook URL is flagged'],
  'REQ-011 README engram claims': ['docs.test.mjs', 'negative: a README claiming engram is bundled via .mcp.json is flagged'],
  'REQ-011 README project tree': ['docs.test.mjs', 'negative: a tree listing skill-sync/ is flagged'],
  'REQ-011 initializer label': ['docs.test.mjs', 'negative: an initializer row labelled Read-only is flagged'],
  'REQ-012 dependencies decision': ['docs.test.mjs', 'negative: a plugin.json declaring only superpowers is flagged'],
  'REQ-014 TDD guide coercion and budget': ['single-source.test.mjs', 'negative: a guide with a coercion phrase or over budget is flagged; a section without an example is not concrete'],
  'REQ-015 TDD single source': ['single-source.test.mjs', 'negative: an implementer copy with a headed RED step block is flagged'],
  'REQ-017 hook newlines': ['hook.test.mjs', 'negative: the old backslash-n concatenation is reported as a violation'],
  'REQ-019 self-guard': ['single-source.test.mjs', 'negative: a phase skill without the guard (or with a guard for another agent) is flagged'],
  'REQ-019 launch template': ['single-source.test.mjs', 'negative: a launch template that hands the agent a skill file is flagged'],
  'REQ-023 state writers': ['single-source.test.mjs', 'negative: a state section that omits the archivist (and keeps the stale sentence) is flagged'],
  'REQ-025 .ai-flow.json schema': ['docs.test.mjs', 'negative: an example without testRunner is flagged'],
  'REQ-027 skill-sync references': ['references.test.mjs', 'negative: the skill-sync checker flags a line that runs scripts/sync.sh'],
};

/** Check ids whose named negative test is not declared (as test('<title>' ...) in its file. */
function missingNegatives(checks, readFile) {
  return Object.entries(checks)
    .filter(([, [file, title]]) => !readFile(file).includes(`test('${title}'`))
    .map(([id, [file, title]]) => `${id}: no test '${title}' in ${file}`);
}

const readStructure = (file) => fs.readFileSync(path.join(STRUCTURE, file), 'utf8');

test('every B2 check id (REQ-002..027) has a declared negative test', () => {
  const reqs = new Set(Object.keys(CHECKS).map((id) => id.slice(0, 7)));
  for (const r of ['REQ-002', 'REQ-003', 'REQ-004', 'REQ-005', 'REQ-006', 'REQ-007', 'REQ-009', 'REQ-011', 'REQ-012', 'REQ-014', 'REQ-015', 'REQ-017', 'REQ-019', 'REQ-023', 'REQ-025', 'REQ-027']) assert.ok(reqs.has(r), `${r} has no entry in CHECKS`);
  assert.deepEqual(missingNegatives(CHECKS, readStructure), []);
});

test('negative: the audit flags a check whose negative test does not exist', () => {
  const fake = { 'REQ-999 x': ['f.test.mjs', 'negative: nothing'] };
  assert.deepEqual(missingNegatives(fake, () => "test('negative: something else', () => {});"), ["REQ-999 x: no test 'negative: nothing' in f.test.mjs"]);
});

// ---- B2b evals checks (REQ-015, REQ-017): check id -> [test file relative to the plugin root, negative test title] ----
const B2B_CHECKS = {
  'B2b nested-capture partial': ['evals/tooling/test/nested-capture.test.mjs', 'one transcript missing (planner): capture partial, missing names the launch, its launcher and depth, reason names planner (REQ-002 S2)'],
  'B2b nested-capture failed': ['evals/tooling/test/nested-capture.test.mjs', 'every transcript unparseable: capture failed with a parse error reason (REQ-002 S3)'],
  'B2b e2e stub partial': ['evals/tooling/test/run.test.mjs', 'negative: e2e stub with the planner transcript deleted reports capture partial naming planner (REQ-015 S2)'],
  'B2b applyCapture prefix': ['evals/tooling/test/nested-capture.test.mjs', 'failed capture: tdd, artifacts and tool_use are n/a with "capture failed:" and na_cause capture (REQ-005 S1)'],
  'B2b self_delegation': ['evals/tooling/test/tooluse.test.mjs', 'self_delegation: orchestrator (depth 1) launching ai-flow:orchestrator is counted at depth 2 (REQ-007 S2)'],
  'B2b run_error class': ['evals/tooling/test/run-error.test.mjs', 'counts that do not reconcile (5 reported, 2 found): unexplained with a reason, failure_reason stays run-error (REQ-008 S2)'],
  'B2b W5 truncated mock input': ['evals/tooling/test/run-error.test.mjs', 'negative: a truncated string input that is not a prefix of any transcript call stays unexplained'],
  'B2b regrade run_error': ['evals/tooling/test/regrade.test.mjs', 'negative: regrade of a W5 error that does not reconcile (5 reported) stays unexplained with failure_reason run-error; a clean run keeps run_error null'],
  'B2b promote partial guard': ['evals/tooling/test/promote.test.mjs', 'one run with partial capture is refused naming the case and run (REQ-011 S4, R3)'],
  'B2b promote version guard': ['evals/tooling/test/promote.test.mjs', 'version mismatch: --plugin-ref v3.4.0 with label v4.0.0-alpha.2 is refused naming the version (REQ-011 S2)'],
  'B2b promote drift guard': ['evals/tooling/test/promote.test.mjs', 'behaviour drift at the SHA is refused naming both hashes (REQ-011 S3)'],
  'B2b raw budget': ['evals/tooling/test/promote.test.mjs', 'the raw dir stays within the 1 MB budget and holds no home path, email or session_context; a 2 MB metrics set is refused (REQ-016 S1, R4)'],
  'B2b runtime-frozen': ['tests/structure/runtime-frozen.test.mjs', 'negative: a changed agent file moves behavior_hash away from the pinned alpha.2 hash'],
  'B2b nested-canary': ['evals/tooling/test/preflight.test.mjs', 'no transcripts from the CLI: the canary fails with guidance'],
  'B2b per-run outlier block': ['evals/tooling/test/compare.test.mjs', 'case d tokens more than 1 sd worse, driven by one run: the markdown lists its 3 per-run token values (REQ-010 S2)'],
};

test('every B2b evals check has a declared negative test (REQ-015)', () => {
  assert.deepEqual(missingNegatives(B2B_CHECKS, (file) => fs.readFileSync(path.join(PLUGIN_ROOT, file), 'utf8')), []);
});

// ---- main untouched (REQ-022 S2) ----
const git = (...args) => spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
const B2_BASE = 'da103ba'; // v4/b2-hygiene was cut from v4/b1-evals here
const noMain = git('rev-parse', '--verify', '-q', 'main').status !== 0 ? 'no local main ref' : false;

test('main still ships 3.4.0 and contains no B2 commit', { skip: noMain }, () => {
  const market = JSON.parse(git('show', 'main:.claude-plugin/marketplace.json').stdout);
  assert.equal(market.metadata.version, '3.4.0');
  assert.equal(market.plugins.find((p) => p.name === 'ai-flow').version, '3.4.0');
  const b2 = Number(git('rev-list', '--count', `${B2_BASE}..HEAD`).stdout.trim());
  const notOnMain = Number(git('rev-list', '--count', `${B2_BASE}..HEAD`, '^main').stdout.trim());
  assert.ok(b2 > 0, 'B2 has commits');
  assert.equal(notOnMain, b2, 'every B2 commit is absent from main');
});
