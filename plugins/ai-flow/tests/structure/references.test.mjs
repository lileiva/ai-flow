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
