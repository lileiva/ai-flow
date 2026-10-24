// Plugin materialization at a git ref (design D3): a detached worktree plus an overlay of the current
// evals/ tree, so measured agents/skills/hooks/commands are exactly the ref's while the suite is current.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from './paths.mjs';

const git = (args, cwd = REPO_ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function revParse(ref) {
  return git(['rev-parse', `${ref}^{commit}`]);
}

/** plugin.json version of plugins/ai-flow at a git ref (tag or commit SHA), via `git show` (B2b D8). */
export function versionAt(ref) {
  return JSON.parse(git(['show', `${revParse(ref)}:plugins/ai-flow/.claude-plugin/plugin.json`])).version;
}

/** Add a detached worktree for ref under the temp dir; returns its absolute path. */
export function addWorktree(ref) {
  const sha = revParse(ref);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aiflow-eval-${sha.slice(0, 12)}-`));
  fs.rmdirSync(dir);
  git(['worktree', 'add', '--detach', '--quiet', dir, sha]);
  return fs.realpathSync(dir);
}

export function removeWorktree(dir) {
  if (!dir) return;
  try { git(['worktree', 'remove', '--force', dir]); } catch { /* not registered or already gone */ }
  fs.rmSync(dir, { recursive: true, force: true });
  try { git(['worktree', 'prune']); } catch { /* best effort */ }
}

const BEHAVIOR_PATHS = ['agents', 'skills', 'commands', 'hooks', '.mcp.json', '.claude-plugin/plugin.json'];

/**
 * Copy the CURRENT repo's plugins/ai-flow/evals/ (minus results/) into the worktree's plugin dir and link
 * the worktree root's .eval-cache to the repo's cache, so case scaffolds find node_modules.
 */
export function overlayEvals(worktree, { sourceEvals = path.join(REPO_ROOT, 'plugins', 'ai-flow', 'evals'), cacheDir = path.join(REPO_ROOT, '.eval-cache') } = {}) {
  const dest = path.join(worktree, 'plugins', 'ai-flow', 'evals');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(sourceEvals, dest, { recursive: true, filter: (src) => path.relative(sourceEvals, src).split(path.sep)[0] !== 'results' });
  const link = path.join(worktree, '.eval-cache');
  if (!fs.existsSync(link)) fs.symlinkSync(cacheDir, link);
  return dest;
}

/** sha256 over relative path, mode and content of the files that define plugin behaviour. */
export function behaviorHash(pluginDir) {
  const files = [];
  for (const p of BEHAVIOR_PATHS) {
    const abs = path.join(pluginDir, p);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) {
      for (const f of fs.readdirSync(abs, { recursive: true })) {
        if (fs.statSync(path.join(abs, f)).isFile()) files.push(path.join(p, f).split(path.sep).join('/'));
      }
    } else files.push(p);
  }
  const h = crypto.createHash('sha256');
  for (const rel of files.sort()) {
    const abs = path.join(pluginDir, rel);
    h.update(`${rel}\0${(fs.statSync(abs).mode & 0o777).toString(8)}\0`).update(fs.readFileSync(abs)).update('\0');
  }
  return h.digest('hex');
}
