// Shared helpers for the plugin structure suite (tests/structure/*.test.mjs).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path of plugins/ai-flow. */
export const PLUGIN_ROOT = path.resolve(HERE, '..', '..');
/** Absolute path of the repository root. */
export const REPO_ROOT = path.resolve(PLUGIN_ROOT, '..', '..');

/**
 * File mode recorded in the git index (e.g. '100755'), or '' when the path is not tracked.
 * @param {string} relPath path relative to REPO_ROOT
 */
export function gitMode(relPath) {
  const out = execFileSync('git', ['ls-files', '-s', '--', relPath], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out.trim().split(/\s+/)[0] ?? '';
}
