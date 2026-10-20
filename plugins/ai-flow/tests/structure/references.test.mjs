// Reference integrity for plugin runtime markdown (REQ-004, REQ-010).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, listRuntimeMd, extractReadRefs, checkReadRefs } from '../lib/plugin-files.mjs';

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
