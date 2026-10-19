// Reference integrity for plugin runtime markdown (REQ-004, REQ-010).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listRuntimeMd } from '../lib/plugin-files.mjs';

test('listRuntimeMd finds agents, skills, shared docs and commands', () => {
  const files = listRuntimeMd();
  assert.ok(files.length > 0);
  for (const f of ['agents/implementer.md', 'skills/flow-apply/SKILL.md', 'skills/_shared/tdd-protocol.md', 'commands/flow-new.md']) {
    assert.ok(files.includes(f), `${f} listed`);
  }
});
