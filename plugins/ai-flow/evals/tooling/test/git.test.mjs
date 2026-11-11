// Task 0.11 (REQ-016 S3; D3; U3): materialize the plugin at a git ref and overlay the current evals/ tree.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { addWorktree, removeWorktree } from '../lib/git.mjs';
import { REPO_ROOT } from '../lib/paths.mjs';

const made = [];
after(() => { for (const w of made) removeWorktree(w); });

test('addWorktree(HEAD) materializes the plugin and removeWorktree cleans up', () => {
  const wt = addWorktree('HEAD');
  assert.ok(fs.existsSync(path.join(wt, 'plugins', 'ai-flow', '.claude-plugin', 'plugin.json')));
  removeWorktree(wt);
  assert.equal(fs.existsSync(wt), false);
  const list = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.ok(!list.includes(wt));
});

import { overlayEvals, behaviorHash } from '../lib/git.mjs';

const BEHAVIOR_DIRS = ['agents', 'skills', 'commands', 'hooks'];

function listFiles(root) {
  return fs.readdirSync(root, { recursive: true }).filter((f) => fs.statSync(path.join(root, f)).isFile()).map((f) => f.split(path.sep).join('/')).sort();
}

test('at v3.4.0 agents/skills/commands/hooks match the tag; the overlay adds only evals/ (+ cache link)', () => {
  const wt = addWorktree('v3.4.0');
  made.push(wt);
  overlayEvals(wt);
  const plugin = path.join(wt, 'plugins', 'ai-flow');
  for (const d of BEHAVIOR_DIRS) {
    const tagged = execFileSync('git', ['ls-tree', '-r', '--name-only', 'v3.4.0', `plugins/ai-flow/${d}/`], { cwd: REPO_ROOT, encoding: 'utf8' })
      .trim().split('\n').map((f) => f.replace(`plugins/ai-flow/${d}/`, '')).sort();
    assert.deepEqual(listFiles(path.join(plugin, d)), tagged, d);
  }
  assert.ok(fs.existsSync(path.join(plugin, 'evals', 'cases', 'a-e2e-bugfix-slugify', 'prompt.md')));
  assert.equal(fs.existsSync(path.join(plugin, 'evals', 'results')), false);
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: wt, encoding: 'utf8' }).trim().split('\n').sort();
  assert.deepEqual(status, ['?? .eval-cache', '?? plugins/ai-flow/evals/']);
  assert.ok(fs.existsSync(path.join(wt, '.eval-cache', 'textkit')));
});

test('behaviorHash is stable and changes when plugin.json changes', () => {
  const wt = addWorktree('v3.4.0');
  made.push(wt);
  const plugin = path.join(wt, 'plugins', 'ai-flow');
  const h1 = behaviorHash(plugin);
  assert.equal(behaviorHash(plugin), h1);
  assert.match(h1, /^[0-9a-f]{64}$/);
  overlayEvals(wt);
  assert.equal(behaviorHash(plugin), h1, 'evals/ overlay must not change the behavior hash');
  const pj = path.join(plugin, '.claude-plugin', 'plugin.json');
  fs.writeFileSync(pj, fs.readFileSync(pj, 'utf8').replace('3.4.0', '4.0.0-alpha.1'));
  assert.notEqual(behaviorHash(plugin), h1);
});

test('hooks/run-hook.cmd stays 100644 at v3.4.0 (as-shipped, U3)', () => {
  const wt = addWorktree('v3.4.0');
  made.push(wt);
  overlayEvals(wt);
  const mode = fs.statSync(path.join(wt, 'plugins', 'ai-flow', 'hooks', 'run-hook.cmd')).mode & 0o777;
  assert.equal(mode & 0o111, 0);
  assert.match(execFileSync('git', ['ls-files', '-s', 'plugins/ai-flow/hooks/run-hook.cmd'], { cwd: wt, encoding: 'utf8' }), /^100644 /);
});

test('B2b: versionAt(ref) reads plugin.json version at a tag or a commit SHA (tracer, REQ-011)', async () => {
  const { versionAt } = await import('../lib/git.mjs');
  assert.equal(versionAt('v3.4.0'), '3.4.0');
  assert.equal(versionAt('8029d9b'), '4.0.0-alpha.2');
});
