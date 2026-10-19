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

// ---- Behavior (REQ-017): warnings render real line breaks ----

const WARNINGS = ['superpowers plugin not found', 'engram not found'];
const BACKSLASH_N = '\\' + 'n';

/** Violations of the warning-line contract in decoded hook context. */
function warningLineViolations(text, expected = WARNINGS) {
  const v = [];
  if (text.includes(BACKSLASH_N)) v.push('literal backslash-n sequence in context');
  for (const w of expected) {
    if (!text.includes(w)) v.push(`missing warning: ${w}`);
    else if (!new RegExp(`\\n- \\*\\*${w}\\*\\*`).test(text)) v.push(`warning not on its own line: ${w}`);
  }
  return v;
}

function contextOf(res) {
  assert.equal(res.status, 0, `exit ${res.status}: ${res.stderr}`);
  const out = JSON.parse(res.stdout);
  return out.hookSpecificOutput?.additionalContext ?? out.additional_context;
}

/** HOME with a fake superpowers cache dir and a PATH with a fake `engram`. */
function depsPresentEnv() {
  const home = tmp('aiflow-home-deps-');
  fs.mkdirSync(path.join(home, '.claude/plugins/cache/claude-plugins-official/superpowers'), { recursive: true });
  const bin = tmp('aiflow-bin-');
  fs.writeFileSync(path.join(bin, 'engram'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return { HOME: home, PATH: `${bin}:/usr/bin:/bin` };
}

test('deps missing: both warnings each start a real line, no literal backslash-n', () => {
  const ctx = contextOf(runHook());
  assert.deepEqual(warningLineViolations(ctx), []);
});

test('superpowers warning does not claim TDD comes from superpowers', () => {
  const ctx = contextOf(runHook());
  const line = ctx.split('\n').find((l) => l.includes('superpowers plugin not found'));
  assert.ok(line, 'superpowers warning line present');
  assert.doesNotMatch(line, /TDD/);
});

test('deps present: no dependency warnings', () => {
  const ctx = contextOf(runHook({ env: depsPresentEnv() }));
  for (const w of WARNINGS) assert.ok(!ctx.includes(w), `unexpected warning: ${w}`);
  assert.ok(!ctx.includes(BACKSLASH_N));
});

test('CLAUDE_PLUGIN_ROOT unset: additional_context shape with the same newline guarantees', () => {
  const res = runHook({ env: { CLAUDE_PLUGIN_ROOT: undefined } });
  const out = JSON.parse(res.stdout);
  assert.equal(out.hookSpecificOutput, undefined);
  assert.equal(typeof out.additional_context, 'string');
  assert.deepEqual(warningLineViolations(out.additional_context), []);
});

test('hooks.json registers run-hook.cmd session-start for startup|resume|clear|compact', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf8'));
  const [entry] = cfg.hooks.SessionStart;
  assert.equal(entry.matcher, 'startup|resume|clear|compact');
  assert.ok(entry.hooks[0].command.includes('run-hook.cmd" session-start'), entry.hooks[0].command);
});

test('negative: the old backslash-n concatenation is reported as a violation', () => {
  const root = pluginCopy();
  const file = path.join(root, 'hooks', 'session-start');
  const src = fs.readFileSync(file, 'utf8');
  const old = src.replaceAll(`warnings+=$'\\n'"`, 'warnings="${warnings}\\n');
  assert.notEqual(old, src, 'fixture rewrite applied');
  fs.writeFileSync(file, old);
  const v = warningLineViolations(contextOf(runHook({ root })));
  assert.ok(v.some((m) => m.includes('literal backslash-n')), JSON.stringify(v));
});
