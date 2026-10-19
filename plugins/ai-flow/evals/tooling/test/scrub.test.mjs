// Pre-push hygiene: no personal/local paths in committed eval files (verify suggestion S2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EVALS_DIR, REPO_ROOT } from '../lib/paths.mjs';
import { LOCAL_PATH_PATTERNS, scrubLocalPaths } from '../lib/scrub.mjs';

test('scrubLocalPaths replaces home dirs, macOS temp folders and claude-<uid> temp dirs with neutral placeholders', () => {
  const home = os.homedir();
  // Split literals so this file does not itself trip the committed-files scan below.
  const [users, folders, uid] = ['/Use' + 'rs/', '/private/var/' + 'folders/', 'claude-' + '501'];
  const s = scrubLocalPaths(`a ${home}/w b ${users}someone/p c ${folders}sh/h7_n3/T/aiflow-eval-x d /private/tmp/${uid}/-x e -private-tmp-${uid}-y`);
  assert.equal(s, 'a /home/user/w b /home/user/p c /tmp/aiflow-eval-x d /private/tmp/claude-uid/-x e -private-tmp-claude-uid-y');
  assert.equal(scrubLocalPaths(s), s, 'idempotent');
});

function committedEvalFiles() {
  // Tracked or untracked-but-not-ignored files: exactly what a commit of the evals tree would contain.
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'plugins/ai-flow/evals', 'plugins/ai-flow/tests/test_evals_tooling.sh'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter(Boolean).filter((f) => fs.existsSync(path.join(REPO_ROOT, f)));
}

test('committed eval files contain no personal or local paths (macOS home dirs, per-user temp folders, claude-<uid>, $HOME, git email)', () => {
  const files = committedEvalFiles();
  assert.ok(files.some((f) => f.startsWith('plugins/ai-flow/evals/baselines/')), 'baseline files are scanned');
  const email = spawnSync('git', ['config', 'user.email'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim();
  const needles = [os.homedir(), ...(email ? [email] : [])];
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
    for (const re of LOCAL_PATH_PATTERNS) if (re.test(text)) hits.push(`${f}: ${re}`);
    for (const n of needles) if (text.includes(n)) hits.push(`${f}: ${n === email ? 'git user email' : '$HOME'}`);
  }
  assert.deepEqual(hits, []);
});

test('the committed raw baseline carries the README marking aggregate-result.json as pre-regrade CLI output', async () => {
  const { RAW_README } = await import('../promote.mjs');
  const dir = path.join(EVALS_DIR, 'baselines', 'raw', 'v3.4.0-sonnet');
  assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), RAW_README('v3.4.0-sonnet'));
});
