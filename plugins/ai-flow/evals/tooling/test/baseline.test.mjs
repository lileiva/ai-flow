// Task 5.2 (REQ-016 S1, REQ-018 S1): guard the committed v3.4.0 sonnet baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BASELINE_SONNET, README_COMPARE_CMD } from '../lib/constants.mjs';
import { REPO_ROOT } from '../lib/paths.mjs';
import { loadSchema, validate } from '../lib/schema.mjs';

const FILE = path.join(REPO_ROOT, BASELINE_SONNET);
const load = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));

test('the committed sonnet baseline exists and validates against baseline.schema.json', () => {
  assert.ok(fs.existsSync(FILE), `missing ${BASELINE_SONNET}`);
  assert.deepEqual(validate(loadSchema('baseline'), load()), []);
});

test('the baseline is a complete v3.4.0 sonnet suite: 5 cases with n=3 each', () => {
  const b = load();
  assert.equal(b.meta.plugin_version, '3.4.0');
  assert.equal(b.meta.plugin_ref, 'v3.4.0');
  assert.equal(b.meta.model, 'sonnet');
  assert.equal(b.meta.complete, true);
  assert.notEqual(b.meta.subset, true);
  assert.deepEqual(Object.keys(b.cases).sort(), ['a', 'b', 'c', 'd', 'e']);
  for (const [id, c] of Object.entries(b.cases)) assert.equal(c.n, 3, `case ${id}`);
  for (const k of ['results_dir', 'worktree', 'resumed_from']) assert.equal(k in b.meta, false, `no local path in meta.${k}`);
});

test('the baseline records SessionStart as shipped (exit 126, 0 tokens) and intended (> 0 tokens)', () => {
  const s = load().session_start;
  assert.equal(s.as_shipped.exit_code, 126);
  assert.equal(s.as_shipped.injected_tokens, 0);
  assert.ok(s.intended.hook_tokens > 0);
  assert.ok(s.intended.hook_chars > 0);
});

test('README_COMPARE_CMD (the baseline compared with itself) exits 0 with no regressions', () => {
  const r = spawnSync('bash', ['-c', README_COMPARE_CMD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /regressions: 0/);
});
