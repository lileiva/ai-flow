// Coercion lint (REQ-010 S2/S3): runtime markdown and the decoded hook output are written in plain, reasoned
// language. The rollout is scoped (R15): SCOPE lists the files checked now; Task 4.1 widens it to the full tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, listRuntimeMd } from '../lib/plugin-files.mjs';
import { collectLintTargets, lintCoercion } from '../lib/coercion-lint.mjs';

test('lint walks runtime markdown and lists files checked', () => {
  const targets = collectLintTargets();
  assert.ok(targets.length > 0);
  const names = targets.map((t) => t.file);
  assert.ok(names.includes('skills/using-ai-flow/SKILL.md'));
  assert.ok(names.includes('hooks/session-start (decoded output)'));
  assert.deepEqual(names.filter((n) => n.endsWith('.md')).sort(), listRuntimeMd());
  assert.equal(typeof lintCoercion, 'function');
});
