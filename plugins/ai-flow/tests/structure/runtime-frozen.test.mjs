// B2b REQ-017: the plugin runtime stays byte-identical to the alpha.2 gate commit 8029d9b while evals tooling changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { behaviorHash } from '../../evals/tooling/lib/git.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PLUGIN = path.join(REPO, 'plugins', 'ai-flow');
export const GATE_SHA = '8029d9b';
export const ALPHA2_BEHAVIOR_HASH = 'a8db88f8f89b8ab7d8b3c6affcde3d771a97eeb033f08b2bbec9f6589bf64440';
const RUNTIME = ['agents', 'skills', 'hooks', 'commands', '.mcp.json', '.claude-plugin/plugin.json'].map((p) => `plugins/ai-flow/${p}`);

const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const reachable = (() => { try { git(['rev-parse', '--verify', `${GATE_SHA}^{commit}`]); return true; } catch { return false; } })();

test('behavior_hash of plugins/ai-flow equals the pinned alpha.2 hash (REQ-017)', () => {
  assert.equal(behaviorHash(PLUGIN), ALPHA2_BEHAVIOR_HASH);
});

test(`runtime files have no diff against ${GATE_SHA} (REQ-017 S1)`, { skip: reachable ? false : `${GATE_SHA} is not reachable (shallow clone?)` }, () => {
  assert.equal(git(['diff', '--stat', GATE_SHA, '--', ...RUNTIME]).trim(), '');
});

test('negative: a changed agent file moves behavior_hash away from the pinned alpha.2 hash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-frozen-'));
  try {
    const copy = path.join(tmp, 'ai-flow');
    for (const p of ['agents', 'skills', 'hooks', 'commands', '.mcp.json', '.claude-plugin']) if (fs.existsSync(path.join(PLUGIN, p))) fs.cpSync(path.join(PLUGIN, p), path.join(copy, p), { recursive: true });
    assert.equal(behaviorHash(copy), ALPHA2_BEHAVIOR_HASH, 'an unchanged copy keeps the pinned hash');
    const agent = path.join(copy, 'agents', fs.readdirSync(path.join(copy, 'agents')).find((f) => f.endsWith('.md')));
    fs.appendFileSync(agent, '\nseeded change\n');
    assert.notEqual(behaviorHash(copy), ALPHA2_BEHAVIOR_HASH);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
