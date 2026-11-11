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
// No runtime pin while B4 is in progress; re-pinned to the B4 gate commit in Task 5.3.
export const RUNTIME_PIN = null;
const NO_PIN = RUNTIME_PIN === null ? 'no runtime pin during B4 (REQ-019)' : false;
const RUNTIME = ['agents', 'skills', 'hooks', 'commands', '.mcp.json', '.claude-plugin/plugin.json'].map((p) => `plugins/ai-flow/${p}`);

const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const reachable = RUNTIME_PIN !== null && (() => { try { git(['rev-parse', '--verify', `${RUNTIME_PIN.sha}^{commit}`]); return true; } catch { return false; } })();

test('behavior_hash of plugins/ai-flow equals the runtime pin (REQ-019)', { skip: NO_PIN }, () => {
  assert.equal(behaviorHash(PLUGIN), RUNTIME_PIN.hash);
});

test('runtime files have no diff against the pinned commit (REQ-019 S1)', { skip: NO_PIN || (reachable ? false : 'pinned commit is not reachable (shallow clone?)') }, () => {
  assert.equal(git(['diff', '--stat', RUNTIME_PIN.sha, '--', ...RUNTIME]).trim(), '');
});

test('negative: a changed agent file moves behavior_hash away from its own unchanged hash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-frozen-'));
  try {
    const copy = path.join(tmp, 'ai-flow');
    for (const p of ['agents', 'skills', 'hooks', 'commands', '.mcp.json', '.claude-plugin']) if (fs.existsSync(path.join(PLUGIN, p))) fs.cpSync(path.join(PLUGIN, p), path.join(copy, p), { recursive: true });
    const h0 = behaviorHash(copy);
    assert.equal(behaviorHash(copy), h0, 'an unchanged copy keeps its hash');
    const agent = path.join(copy, 'agents', fs.readdirSync(path.join(copy, 'agents')).find((f) => f.endsWith('.md')));
    fs.appendFileSync(agent, '\nseeded change\n');
    assert.notEqual(behaviorHash(copy), h0);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('runtime pin is not the alpha.2 hash while B4 is in progress (REQ-019 S1)', () => {
  assert.ok(RUNTIME_PIN === null || RUNTIME_PIN.hash !== ALPHA2_BEHAVIOR_HASH, 'RUNTIME_PIN must be null or differ from the alpha.2 hash');
});
