// Reference integrity for plugin runtime markdown (REQ-004, REQ-010).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PLUGIN_ROOT, listRuntimeMd, extractReadRefs, checkReadRefs,
  findRelativePaths, findBarePrefixes, extractQualifiedRefs, resolveQualifiedRef, applyAllowlist, scan,
} from '../lib/plugin-files.mjs';

test('listRuntimeMd finds agents, skills, shared docs and commands', () => {
  const files = listRuntimeMd();
  assert.ok(files.length > 0);
  for (const f of ['agents/implementer.md', 'skills/flow-apply/SKILL.md', 'skills/_shared/tdd-protocol.md', 'commands/flow-new.md']) {
    assert.ok(files.includes(f), `${f} listed`);
  }
});

// ---- Every ${CLAUDE_PLUGIN_ROOT}/<path> READ_REF resolves (REQ-004 S1-S2, REQ-010 S2) ----

for (const rel of listRuntimeMd()) {
  test(`READ_REFs resolve: ${rel}`, () => {
    assert.deepEqual(checkReadRefs(path.join(PLUGIN_ROOT, rel)), []);
  });
}

test('implementer.md reads the TDD guide via ${CLAUDE_PLUGIN_ROOT}', () => {
  const text = fs.readFileSync(path.join(PLUGIN_ROOT, 'agents/implementer.md'), 'utf8');
  const targets = extractReadRefs(text).map((r) => r.path);
  assert.ok(targets.includes('skills/_shared/tdd-protocol.md'), 'implementer.md has no READ_REF to tdd-protocol.md');
});

test('negative: a dangling READ_REF is reported with file, line and missing target', () => {
  const file = path.join(PLUGIN_ROOT, 'tests/fixtures/refs/dangling.md');
  const v = checkReadRefs(file);
  assert.equal(v.length, 1);
  assert.equal(v[0].file, file);
  assert.equal(v[0].line, 4);
  assert.equal(v[0].target, 'skills/_shared/does-not-exist.md');
});

// ---- skill-sync is retired (REQ-027 S1, S2) ----

const SKILL_SYNC_RE = /skill-sync|scripts\/sync\.sh|\.claude\/rules/;

/** Lines of `text` that mention skill-sync, scripts/sync.sh or .claude/rules, as `file:line`. */
function skillSyncMentions(file, text) {
  return text.split('\n').flatMap((l, i) => (SKILL_SYNC_RE.test(l) ? [`${file}:${i + 1}`] : []));
}

/** Every file under the plugin root, relative, excluding tests/ (which names the retired paths) and raw eval traces. */
function pluginFiles(rel = '') {
  return fs.readdirSync(path.join(PLUGIN_ROOT, rel)).flatMap((n) => {
    const child = rel ? `${rel}/${n}` : n;
    if (child === 'tests' || child === 'evals/baselines/raw' || child === 'evals/results' || n === '.DS_Store') return [];
    return fs.statSync(path.join(PLUGIN_ROOT, child)).isDirectory() ? pluginFiles(child) : [child];
  });
}

test('no plugin file references skill-sync, scripts/sync.sh or .claude/rules', () => {
  const hits = pluginFiles().flatMap((f) => skillSyncMentions(f, fs.readFileSync(path.join(PLUGIN_ROOT, f), 'utf8')));
  assert.deepEqual(hits, []);
});

test('skill-sync paths are gone', () => {
  const left = ['skills/skill-sync', 'scripts', 'tests/test_batch3_skill_sync.sh', '.claude'].filter((p) => fs.existsSync(path.join(PLUGIN_ROOT, p)));
  assert.deepEqual(left, []);
});

test('negative: the skill-sync checker flags a line that runs scripts/sync.sh', () => {
  assert.deepEqual(skillSyncMentions('README.md', 'Setup\nrun scripts/sync.sh\n'), ['README.md:2']);
});

// ---- path and command-prefix lints (REQ-005 S2/S3, REQ-006 S2/S3) ----

const fixture = (n) => fs.readFileSync(path.join(PLUGIN_ROOT, 'tests/fixtures/refs', n), 'utf8');

test('relative agents/ or skills/ path is flagged with its line; ${CLAUDE_PLUGIN_ROOT}/ paths are not', () => {
  assert.deepEqual(findRelativePaths(fixture('relative.md')), [{ line: 3, match: 'agents/foo.md' }]);
});

test('bare /flow-<x> command is flagged with its line; a plain word flow-apply is not', () => {
  assert.deepEqual(findBarePrefixes(fixture('bare.md')), [{ line: 3, match: '/flow-verify' }]);
});

test('canonical references produce no violations', () => {
  const t = fixture('canonical.md');
  assert.deepEqual(findRelativePaths(t), []);
  assert.deepEqual(findBarePrefixes(t), []);
});

test('qualified refs ai-flow:<agent>, ai-flow:<skill> and /ai-flow:<cmd> resolve; unknown names do not', () => {
  assert.deepEqual(extractQualifiedRefs(fixture('canonical.md')).map((r) => r.name), ['flow-verify', 'designer']);
  for (const n of ['designer', 'flow-apply', 'flow-verify', 'flow-new', 'using-ai-flow']) assert.ok(resolveQualifiedRef(n), n);
  assert.equal(resolveQualifiedRef('nope'), null);
});

test('allowlist entry {file, linePattern, reason} skips its line; other lines are still reported', () => {
  const v = findRelativePaths(fixture('allowlisted.md')).map((x) => ({ file: 'allowlisted.md', ...x }));
  const kept = applyAllowlist(v, [{ file: 'allowlisted.md', linePattern: /Legacy example/, reason: 'fixture: documents the old layout' }], fixture('allowlisted.md'));
  assert.deepEqual(kept.map((x) => x.match), ['agents/bar.md']);
});

test('negative: an allowlist entry without a reason throws', () => {
  assert.throws(() => applyAllowlist([], [{ file: 'x.md', linePattern: /x/ }], ''), /reason/);
});

test('scan() applies relative-path and bare-prefix rules together', () => {
  assert.deepEqual(scan('bare.md', fixture('bare.md')).map((v) => v.rule), ['bare-prefix']);
  assert.deepEqual(scan('relative.md', fixture('relative.md')).map((v) => v.rule), ['relative-path']);
});
