// Task 0.6 (REQ-002 S2-S4): deterministic, isolated scaffolds from the shared textkit library.
// Skipped when .eval-cache is missing (run prepare.mjs first).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EVALS_DIR, TEXTKIT_CACHE } from '../lib/paths.mjs';

const CASE_A = path.join(EVALS_DIR, 'cases', 'a-e2e-bugfix-slugify');
const skip = fs.existsSync(path.join(TEXTKIT_CACHE, 'node_modules')) ? false : 'no .eval-cache (run prepare.mjs)';

const created = [];
after(() => { for (const d of created) fs.rmSync(d, { recursive: true, force: true }); });

function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(d);
  return d;
}

function scaffold(caseDir, extraEnv = {}) {
  const cwd = tmp('aiflow-scaffold-');
  const home = tmp('aiflow-home-');
  const env = { PATH: process.env.PATH, HOME: home, TMPDIR: os.tmpdir(), TERM: 'dumb', ...extraEnv };
  const res = spawnSync('bash', [path.join(caseDir, 'scaffold.sh')], { cwd, env, encoding: 'utf8' });
  return { cwd, res };
}

test('case (a) scaffold produces the textkit package.json', { skip }, () => {
  const { cwd, res } = scaffold(CASE_A);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(cwd, 'package.json')));
});

import crypto from 'node:crypto';
import { NODE26_CACHE } from '../lib/paths.mjs';

const EXCLUDE = new Set(['node_modules', '.git', '.eval-node']);

export function treeHash(root) {
  const h = crypto.createHash('sha256');
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(root, rel)).sort()) {
      if (EXCLUDE.has(name)) continue;
      const r = path.join(rel, name);
      const st = fs.statSync(path.join(root, r));
      if (st.isDirectory()) walk(r);
      else h.update(r + '\0' + (st.mode & 0o777).toString(8) + '\0').update(fs.readFileSync(path.join(root, r)));
    }
  };
  walk('');
  return h.digest('hex');
}

function vitest(cwd, args = []) {
  const node = path.join(NODE26_CACHE, 'bin', 'node');
  return spawnSync(node, [path.join(cwd, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...args], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: os.tmpdir() } });
}

test('S3: two scaffolds of case (a) are byte-identical (excluding node_modules/.git) with the same commit', { skip }, () => {
  const a = scaffold(CASE_A);
  const b = scaffold(CASE_A);
  assert.equal(treeHash(a.cwd), treeHash(b.cwd));
  const head = (cwd) => spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).stdout.trim();
  assert.equal(head(a.cwd), head(b.cwd));
});

test('S2: case (a) visible suite passes while the hidden acceptance suite fails (bug present)', { skip }, () => {
  const { cwd } = scaffold(CASE_A);
  const visible = vitest(cwd);
  assert.equal(visible.status, 0, visible.stdout + visible.stderr);
  fs.cpSync(path.join(CASE_A, 'acceptance'), path.join(cwd, '.eval-acceptance'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.eval-acceptance', 'vitest.config.mjs'), "export default { test: { include: ['.eval-acceptance/**/*.test.js'] } };\n");
  const acceptance = vitest(cwd, ['--config', '.eval-acceptance/vitest.config.mjs']);
  assert.notEqual(acceptance.status, 0);
  assert.match(acceptance.stdout, /creme-brulee/);
});

test('S4: a fresh scaffold has no leftovers from a previous run', { skip }, () => {
  const first = scaffold(CASE_A);
  fs.writeFileSync(path.join(first.cwd, 'src', 'leftover.js'), 'x');
  const second = scaffold(CASE_A);
  assert.equal(fs.existsSync(path.join(second.cwd, 'src', 'leftover.js')), false);
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: second.cwd, encoding: 'utf8' }).stdout, '');
});

test('a missing eval cache fails fast with a clear message', { skip }, () => {
  const { res } = scaffold(CASE_A, { AIFLOW_EVAL_CACHE_DIR: '/nonexistent-eval-cache' });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /eval cache missing.*prepare\.mjs/);
});

test('the scaffold finishes well under the 120 s limit', { skip }, () => {
  const t0 = Date.now();
  const { res } = scaffold(CASE_A);
  assert.equal(res.status, 0);
  assert.ok(Date.now() - t0 < 120_000);
});

// Batch 2 cases (REQ-002 S1, REQ-006): fixture baseline state per case.
const CASES = path.join(EVALS_DIR, 'cases');

function acceptance(caseDir, cwd) {
  fs.cpSync(path.join(caseDir, 'acceptance'), path.join(cwd, '.eval-acceptance'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.eval-acceptance', 'vitest.config.mjs'), "export default { test: { include: ['.eval-acceptance/**/*.test.js'] } };\n");
  return vitest(cwd, ['--config', '.eval-acceptance/vitest.config.mjs']);
}

test('case (b): visible suite passes and acceptance fails because truncateWords is absent (S1)', { skip }, () => {
  const dir = path.join(CASES, 'b-e2e-feature-truncate-words');
  const { cwd, res } = scaffold(dir);
  assert.equal(res.status, 0, res.stderr);
  const visible = vitest(cwd);
  assert.equal(visible.status, 0, visible.stdout + visible.stderr);
  const acc = acceptance(dir, cwd);
  assert.notEqual(acc.status, 0);
  assert.match(acc.stdout + acc.stderr, /truncateWords is not a function/);
});

test('case (c): visible suite passes and acceptance fails because the CSV module is absent (S1)', { skip }, () => {
  const dir = path.join(CASES, 'c-e2e-feature-csv');
  const { cwd, res } = scaffold(dir);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(vitest(cwd).status, 0);
  const acc = acceptance(dir, cwd);
  assert.notEqual(acc.status, 0);
  assert.match(acc.stdout + acc.stderr, /toCSV is not a function|parseCSV is not a function/);
});

test('case (d): acceptance fails before apply (wordCount/readingTime absent)', { skip }, () => {
  const dir = path.join(CASES, 'd-phase-apply-seeded');
  const { cwd, res } = scaffold(dir);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(vitest(cwd).status, 0);
  const acc = acceptance(dir, cwd);
  assert.notEqual(acc.status, 0);
  assert.match(acc.stdout + acc.stderr, /wordCount is not a function/);
});
