// Task 0.9 (REQ-006 S1-S3; D5; U5): hidden acceptance graded post-run in an OS sandbox.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runSandboxed } from '../lib/sandbox.mjs';
import { NODE26_CACHE } from '../lib/paths.mjs';

const NODE = path.join(NODE26_CACHE, 'bin', 'node');
const skip = fs.existsSync(NODE) ? false : 'no .eval-cache/node26 (run prepare.mjs)';
const created = [];
after(() => { for (const d of created) fs.rmSync(d, { recursive: true, force: true }); });
function tmp(prefix) { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))); created.push(d); return d; }

test('runSandboxed runs the staged Node 26 under OS containment', { skip }, () => {
  const dir = tmp('aiflow-sbx-');
  const r = runSandboxed([NODE, '--version'], { cwd: dir, writableDir: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^v26\./);
  assert.equal(r.containment, 'sandbox-exec');
});

import { gradeOutcome } from '../grade-outcome.mjs';
import { EVALS_DIR, TEXTKIT_CACHE } from '../lib/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASE_A = path.join(EVALS_DIR, 'cases', 'a-e2e-bugfix-slugify');
const LIB = path.join(EVALS_DIR, 'fixtures', 'scaffold-lib.sh');
const skipWs = skip || (fs.existsSync(path.join(TEXTKIT_CACHE, 'node_modules')) ? false : 'no textkit cache');

function workspace(overlay = '-') {
  const cwd = tmp('aiflow-ws-');
  const r = spawnSync('bash', ['-c', `set -e; source "${LIB}"; scaffold_textkit "${overlay}"`], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: tmp('aiflow-home-') } });
  assert.equal(r.status, 0, r.stderr);
  return cwd;
}

test('S1: a correct fix passes visible and hidden acceptance suites', { skip: skipWs }, () => {
  const ws = workspace(path.join(HERE, 'fixtures', 'workspaces', 'a-fixed'));
  const r = gradeOutcome({ workspace: ws, caseDir: CASE_A });
  assert.equal(r.visible.exit, 0, JSON.stringify(r));
  assert.equal(r.acceptance.exit, 0, JSON.stringify(r));
  assert.equal(r.acceptance.failed, 0);
  assert.ok(r.acceptance.total >= 4);
  assert.equal(r.pass, true);
  assert.equal(r.containment, 'sandbox-exec');
});

test('S2: skipping the failing visible test does not fool the hidden acceptance suite', { skip: skipWs }, () => {
  const ws = workspace(path.join(HERE, 'fixtures', 'workspaces', 'a-tampered'));
  const r = gradeOutcome({ workspace: ws, caseDir: CASE_A });
  assert.equal(r.visible.exit, 0);
  assert.notEqual(r.acceptance.exit, 0);
  assert.ok(r.acceptance.failed > 0);
  assert.equal(r.pass, false);
});

test('S3: grading copy excludes .git/node_modules/.eval-node and never touches the source workspace', { skip: skipWs }, () => {
  const ws = workspace();
  fs.mkdirSync(path.join(ws, '.eval-node'));
  fs.writeFileSync(path.join(ws, '.eval-node', 'marker'), 'x');
  const before = fs.readdirSync(ws).sort();
  const r = gradeOutcome({ workspace: ws, caseDir: CASE_A, keepGradingDir: true });
  created.push(r.gradingDir);
  assert.deepEqual(fs.readdirSync(ws).sort(), before);
  assert.equal(fs.existsSync(path.join(ws, '.eval-acceptance')), false);
  assert.equal(fs.existsSync(path.join(r.gradingDir, '.git')), false);
  assert.equal(fs.existsSync(path.join(r.gradingDir, '.eval-node')), false);
  assert.equal(fs.lstatSync(path.join(r.gradingDir, 'node_modules')).isDirectory(), true);
});

test('sandbox denies writes outside the grading dir and network sockets', { skip }, () => {
  const dir = tmp('aiflow-sbx-');
  const outside = tmp('aiflow-outside-');
  const w = runSandboxed([NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(path.join(outside, 'x'))}, 'x')`], { cwd: dir, writableDir: dir });
  assert.notEqual(w.status, 0);
  assert.equal(fs.existsSync(path.join(outside, 'x')), false);
  const inside = runSandboxed([NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(path.join(dir, 'x'))}, 'x')`], { cwd: dir, writableDir: dir });
  assert.equal(inside.status, 0, inside.stderr);
  const net = runSandboxed([NODE, '-e', "const s=require('net').connect(80,'1.1.1.1');s.on('connect',()=>process.exit(0));s.on('error',e=>{console.error(e.code);process.exit(7)})"], { cwd: dir, writableDir: dir, timeoutMs: 10_000 });
  assert.equal(net.status, 7, net.stdout + net.stderr);
});

test('refuses with NO_CONTAINMENT when no sandbox is available, unless unsafeHostGrading', () => {
  const dir = tmp('aiflow-sbx-');
  assert.throws(() => runSandboxed(['/bin/echo', 'x'], { cwd: dir, writableDir: dir, containment: null }), (e) => e.code === 'NO_CONTAINMENT');
  const r = runSandboxed(['/bin/echo', 'x'], { cwd: dir, writableDir: dir, containment: null, unsafeHostGrading: true });
  assert.equal(r.stdout.trim(), 'x');
});

test('a hung test run is killed at the timeout', { skip }, () => {
  const dir = tmp('aiflow-sbx-');
  const r = runSandboxed([NODE, '-e', 'setTimeout(()=>{}, 60000)'], { cwd: dir, writableDir: dir, timeoutMs: 500 });
  assert.equal(r.timedOut, true);
});

// Task 2.2 (REQ-006 S1-S2): case (b) grading fixtures.
const CASE_B = path.join(EVALS_DIR, 'cases', 'b-e2e-feature-truncate-words');

test('case (b): a correct truncateWords passes; a stub that returns its input fails', { skip: skipWs }, () => {
  const good = gradeOutcome({ workspace: workspace(path.join(HERE, 'fixtures', 'workspaces', 'b-fixed')), caseDir: CASE_B });
  assert.equal(good.pass, true, JSON.stringify(good));
  const stub = workspace(path.join(HERE, 'fixtures', 'workspaces', 'b-fixed'));
  fs.writeFileSync(path.join(stub, 'src', 'truncate-words.js'), 'export function truncateWords(str) { return str; }\n');
  fs.rmSync(path.join(stub, 'test', 'truncate-words.test.js')); // agent "made it green" by dropping its own test
  const bad = gradeOutcome({ workspace: stub, caseDir: CASE_B });
  assert.equal(bad.visible.exit, 0);
  assert.ok(bad.acceptance.failed > 0);
  assert.equal(bad.pass, false);
});

// Task 2.3: case (c) reference solution passes the hidden CSV acceptance suite.
test('case (c): c-fixed (toCSV/parseCSV, RFC 4180 quoting, round-trip) passes', { skip: skipWs }, () => {
  const r = gradeOutcome({ workspace: workspace(path.join(HERE, 'fixtures', 'workspaces', 'c-fixed')), caseDir: path.join(EVALS_DIR, 'cases', 'c-e2e-feature-csv') });
  assert.equal(r.pass, true, JSON.stringify(r));
  assert.ok(r.acceptance.total >= 6);
});
