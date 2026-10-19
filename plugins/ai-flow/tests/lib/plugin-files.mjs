// Shared helpers for the plugin structure suite (tests/structure/*.test.mjs).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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

// Runtime markdown: agents/*.md, skills/<name>/SKILL.md, skills/_shared/*.md, commands/*.md (sorted, relative to PLUGIN_ROOT).
export function listRuntimeMd() {
  const mdIn = (dir) => readdirSafe(dir).filter((n) => n.endsWith('.md')).map((n) => `${dir}/${n}`);
  const skills = readdirSafe('skills')
    .filter((n) => n !== '_shared' && fs.existsSync(path.join(PLUGIN_ROOT, 'skills', n, 'SKILL.md')))
    .map((n) => `skills/${n}/SKILL.md`);
  return [...mdIn('agents'), ...skills, ...mdIn('skills/_shared'), ...mdIn('commands')].sort();
}

function readdirSafe(rel) {
  const abs = path.join(PLUGIN_ROOT, rel);
  return fs.existsSync(abs) ? fs.readdirSync(abs) : [];
}
