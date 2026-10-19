// Task 0.3 (REQ-002 S1-S2): textkit fixture template and deterministic node_modules cache.
import { test } from 'node:test';
import { tmpDir } from './helpers.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { cacheTextkit } from '../prepare.mjs';
import { NODE26_CACHE, TEXTKIT_CACHE } from '../lib/paths.mjs';

test('cacheTextkit dry run plans npm ci in .eval-cache/textkit with staged Node 26 first on PATH', () => {
  const plan = cacheTextkit({ dryRun: true });
  assert.equal(plan.cwd, TEXTKIT_CACHE);
  assert.deepEqual([plan.cmd, ...plan.args], ['npm', 'ci']);
  assert.ok(plan.env.PATH.startsWith(path.join(NODE26_CACHE, 'bin') + path.delimiter));
});

import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { EVALS_DIR } from '../lib/paths.mjs';

function fakeTemplate(lock) {
  const dir = tmpDir('aiflow-tpl-');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"t"}');
  fs.writeFileSync(path.join(dir, 'package-lock.json'), lock);
  return dir;
}

function spyRunner() {
  const calls = [];
  const run = (plan) => {
    calls.push(plan);
    fs.mkdirSync(path.join(plan.cwd, 'node_modules'), { recursive: true });
  };
  return { calls, run };
}

test('cacheTextkit stamps sha256(package-lock.json) and skips when unchanged', () => {
  const template = fakeTemplate('{"lockfileVersion":3}');
  const cacheDir = path.join(tmpDir('aiflow-cache-'), 'textkit');
  const spy = spyRunner();
  const r1 = cacheTextkit({ template, cacheDir, run: spy.run });
  assert.equal(r1.skipped, false);
  const expected = crypto.createHash('sha256').update('{"lockfileVersion":3}').digest('hex');
  assert.equal(fs.readFileSync(path.join(cacheDir, '.stamp'), 'utf8').trim(), expected);
  assert.ok(fs.existsSync(path.join(cacheDir, 'package-lock.json')));
  const r2 = cacheTextkit({ template, cacheDir, run: spy.run });
  assert.equal(r2.skipped, true);
  assert.equal(spy.calls.length, 1);
});

test('cacheTextkit rebuilds when the lockfile changes', () => {
  const template = fakeTemplate('{"v":1}');
  const cacheDir = path.join(tmpDir('aiflow-cache-'), 'textkit');
  const spy = spyRunner();
  cacheTextkit({ template, cacheDir, run: spy.run });
  fs.writeFileSync(path.join(template, 'package-lock.json'), '{"v":2}');
  const r = cacheTextkit({ template, cacheDir, run: spy.run });
  assert.equal(r.skipped, false);
  assert.equal(spy.calls.length, 2);
});

test('fixtures/ contains no prompt.md or case.yaml (they would be discovered as cases)', () => {
  const offenders = fs.readdirSync(path.join(EVALS_DIR, 'fixtures'), { recursive: true })
    .filter((f) => ['prompt.md', 'case.yaml'].includes(path.basename(f)));
  assert.deepEqual(offenders, []);
});
