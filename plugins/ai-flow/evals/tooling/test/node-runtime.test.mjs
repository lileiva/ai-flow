// Task 0.2 (REQ-002 toolchain; D9 amended by U2): resolve and stage nvm Node 26 only.
import { test } from 'node:test';
import { tmpDir } from './helpers.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveNode26 } from '../lib/node-runtime.mjs';

function fakeNvm(versions) {
  const root = tmpDir('aiflow-nvm-');
  for (const v of versions) {
    const bin = path.join(root, 'versions', 'node', v, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\necho ' + v + '\n', { mode: 0o755 });
  }
  return root;
}

test('resolveNode26 returns the v26 install dir from an nvm root', () => {
  const nvmDir = fakeNvm(['v26.5.0']);
  assert.equal(resolveNode26({ nvmDir, env: {} }), path.join(nvmDir, 'versions', 'node', 'v26.5.0'));
});

import { stageNode26 } from '../lib/node-runtime.mjs';

function fakeInstall(nvmDir, v) {
  const src = path.join(nvmDir, 'versions', 'node', v);
  const npmBin = path.join(src, 'lib', 'node_modules', 'npm', 'bin');
  fs.mkdirSync(npmBin, { recursive: true });
  fs.writeFileSync(path.join(npmBin, 'npm-cli.js'), '// npm');
  fs.writeFileSync(path.join(npmBin, 'npx-cli.js'), '// npx');
  fs.mkdirSync(path.join(src, 'lib', 'node_modules', 'some-global'), { recursive: true });
  fs.writeFileSync(path.join(src, 'lib', 'node_modules', 'some-global', 'index.js'), '');
  fs.symlinkSync('../lib/node_modules/npm/bin/npm-cli.js', path.join(src, 'bin', 'npm'));
  fs.symlinkSync('../lib/node_modules/npm/bin/npx-cli.js', path.join(src, 'bin', 'npx'));
  return src;
}

test('the highest v26.x wins when other majors are present', () => {
  const nvmDir = fakeNvm(['v24.11.1', 'v26.2.0', 'v26.10.1', 'v26.5.0']);
  assert.equal(path.basename(resolveNode26({ nvmDir, env: {} })), 'v26.10.1');
});

test('throws NODE26_NOT_FOUND when only other majors exist (no fallback)', () => {
  const nvmDir = fakeNvm(['v20.20.2', 'v22.21.1', 'v24.11.1']);
  assert.throws(() => resolveNode26({ nvmDir, env: {} }), (e) => e.code === 'NODE26_NOT_FOUND');
});

test('AIFLOW_EVAL_NODE_DIR pointing to a non-26 install throws NODE26_REQUIRED', () => {
  const nvmDir = fakeNvm(['v24.11.1', 'v26.5.0']);
  const v24 = path.join(nvmDir, 'versions', 'node', 'v24.11.1');
  assert.throws(() => resolveNode26({ nvmDir, env: { AIFLOW_EVAL_NODE_DIR: v24 } }), (e) => e.code === 'NODE26_REQUIRED');
});

test('AIFLOW_EVAL_NODE_DIR pointing to a v26 install is used', () => {
  const nvmDir = fakeNvm(['v26.5.0', 'v26.9.0']);
  const v265 = path.join(nvmDir, 'versions', 'node', 'v26.5.0');
  assert.equal(resolveNode26({ nvmDir, env: { AIFLOW_EVAL_NODE_DIR: v265 } }), v265);
});

test('stageNode26 copies node + npm only, recreates links, writes stamp, is idempotent', () => {
  const nvmDir = fakeNvm(['v26.5.0']);
  const src = fakeInstall(nvmDir, 'v26.5.0');
  const dest = path.join(tmpDir('aiflow-stage-'), 'node26');
  const r1 = stageNode26(src, dest);
  assert.equal(r1.staged, true);
  assert.ok(fs.existsSync(path.join(dest, 'bin', 'node')));
  assert.ok(fs.existsSync(path.join(dest, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')));
  assert.ok(!fs.existsSync(path.join(dest, 'lib', 'node_modules', 'some-global')));
  assert.equal(fs.readlinkSync(path.join(dest, 'bin', 'npm')), '../lib/node_modules/npm/bin/npm-cli.js');
  assert.equal(fs.readlinkSync(path.join(dest, 'bin', 'npx')), '../lib/node_modules/npm/bin/npx-cli.js');
  const stamp = JSON.parse(fs.readFileSync(path.join(dest, '.stamp'), 'utf8'));
  assert.deepEqual(stamp, { version: 'v26.5.0', source: src });
  const r2 = stageNode26(src, dest);
  assert.equal(r2.staged, false);
});

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sandboxNodeStrategy } from '../lib/node-runtime.mjs';
import { removeKeptTemp } from '../preflight.mjs';

const PREFLIGHT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'preflight.mjs');

test('sandboxNodeStrategy R1 puts nvm Node 26 bin and its npm package dir on PATH (read grant)', () => {
  const nvmDir = fakeNvm(['v26.5.0']);
  const v26 = path.join(nvmDir, 'versions', 'node', 'v26.5.0');
  const s = sandboxNodeStrategy({ config: { node: { strategy: 'R1' } }, nvmDir, env: {} });
  assert.equal(s.name, 'R1');
  assert.deepEqual(s.pathPrefix, [path.join(v26, 'bin'), path.join(v26, 'lib', 'node_modules', 'npm')]);
});

test('sandboxNodeStrategy throws NODE_STRATEGY_MISSING when config has no node.strategy', () => {
  assert.throws(() => sandboxNodeStrategy({ config: {}, env: {} }), (e) => e.code === 'NODE_STRATEGY_MISSING');
});

test('the committed config records a node strategy', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(path.dirname(PREFLIGHT), 'config.json'), 'utf8'));
  assert.ok(['R1', 'R2', 'R3', 'R4'].includes(cfg.node?.strategy));
});

test('preflight --probe-node with no recorded strategy exits 3 "Node 26 not usable in eval sandbox"', () => {
  const dir = tmpDir('aiflow-cfg-');
  const cfg = path.join(dir, 'config.json');
  fs.writeFileSync(cfg, '{}');
  const res = spawnSync(process.execPath, [PREFLIGHT, '--probe-node'], { env: { ...process.env, AIFLOW_EVAL_CONFIG: cfg, AIFLOW_EVAL_CLAUDE_BIN: '/usr/bin/false' }, encoding: 'utf8' });
  assert.equal(res.status, 3);
  assert.match(res.stderr, /Node 26 not usable in eval sandbox/);
});

test('removeKeptTemp deletes a kept eval dir with read-only root and sealed (d---------) children', () => {
  const root = tmpDir('aiflow-kept-');
  fs.mkdirSync(path.join(root, 'sealed', 'inner'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sealed', 'inner', 'f'), 'x');
  fs.chmodSync(path.join(root, 'sealed'), 0o000);
  fs.chmodSync(root, 0o500);
  removeKeptTemp(root);
  assert.equal(fs.existsSync(root), false);
});
