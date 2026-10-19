// SessionStart hook: executable on Unix (REQ-016) and real-newline warnings (REQ-017).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLUGIN_ROOT, gitMode } from '../lib/plugin-files.mjs';

const HOOKS_REL = 'plugins/ai-flow/hooks';

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Temp plugin copy holding only what the hook needs (no sibling superpowers dir). */
function pluginCopy() {
  const parent = tmp('aiflow-hook-');
  const root = path.join(parent, 'ai-flow');
  fs.cpSync(path.join(PLUGIN_ROOT, 'hooks'), path.join(root, 'hooks'), { recursive: true });
  fs.cpSync(path.join(PLUGIN_ROOT, 'skills', 'using-ai-flow'), path.join(root, 'skills', 'using-ai-flow'), { recursive: true });
  return root;
}

/**
 * Run the hook the way hooks.json does: a shell runs the quoted run-hook.cmd path directly (not via `bash`).
 * @param {{root?: string, env?: Record<string,string|undefined>}} opts
 */
function runHook({ root = pluginCopy(), env = {} } = {}) {
  const cmd = `"${path.join(root, 'hooks', 'run-hook.cmd')}" session-start`;
  const baseEnv = { PATH: '/usr/bin:/bin', HOME: tmp('aiflow-home-'), CLAUDE_PLUGIN_ROOT: root };
  const merged = { ...baseEnv, ...env };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  return spawnSync('/bin/sh', ['-c', cmd], { env: merged, encoding: 'utf8' });
}

test('run-hook.cmd and session-start are executable in the git index', () => {
  assert.equal(gitMode(`${HOOKS_REL}/run-hook.cmd`), '100755');
  assert.equal(gitMode(`${HOOKS_REL}/session-start`), '100755');
});

test('run-hook.cmd session-start executes directly and prints SessionStart JSON', () => {
  const res = runHook();
  assert.equal(res.status, 0, `exit ${res.status}: ${res.stderr}`);
  const out = JSON.parse(res.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(out.hookSpecificOutput.additionalContext.length > 0);
});
