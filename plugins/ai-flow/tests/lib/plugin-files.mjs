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

const READ_REF_RE = /\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_./-]*[A-Za-z0-9_-])/g;

/**
 * `${CLAUDE_PLUGIN_ROOT}/<path>` references in markdown text.
 * @returns {{line: number, path: string}[]} 1-based line numbers, paths relative to the plugin root
 */
export function extractReadRefs(text) {
  return text.split('\n').flatMap((l, i) => [...l.matchAll(READ_REF_RE)].map((m) => ({ line: i + 1, path: m[1] })));
}

/**
 * READ_REFs in `file` whose target does not exist under PLUGIN_ROOT.
 * @returns {{file: string, line: number, target: string}[]}
 */
export function checkReadRefs(file) {
  return extractReadRefs(fs.readFileSync(file, 'utf8'))
    .filter((r) => !fs.existsSync(path.join(PLUGIN_ROOT, r.path)))
    .map((r) => ({ file, line: r.line, target: r.path }));
}

const KEY_RE = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/;

/**
 * Tolerant frontmatter parser: top-level `key: value`, folded `>` / literal `|` blocks, nested maps
 * (kept as raw indented text). Throws on missing delimiters or unparseable top-level lines.
 * @returns {{data: Record<string, string>, body: string}}
 */
export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error('frontmatter: missing --- delimiters');
  const data = {};
  let key = null;
  let mode = null; // '>' | '|' | 'map'
  let block = [];
  const flush = () => {
    if (key === null || mode === null) return;
    data[key] = mode === '>' ? block.map((l) => l.trim()).join(' ').trim() : block.join('\n');
  };
  for (const line of m[1].split('\n')) {
    if (/^\s/.test(line) || line === '') {
      if (mode === null && line.trim() !== '') throw new Error(`frontmatter: unexpected indented line '${line}'`);
      if (mode !== null) block.push(line);
      continue;
    }
    const kv = KEY_RE.exec(line);
    if (!kv) throw new Error(`frontmatter: cannot parse line '${line}'`);
    flush();
    key = kv[1];
    const value = (kv[2] ?? '').trim();
    block = [];
    if (value === '>' || value === '|') mode = value;
    else if (value === '') mode = 'map';
    else { data[key] = value; mode = null; }
  }
  flush();
  return { data, body: m[2] };
}

// Allowed runtime files (D7). Paths relative to the plugin root.
const SHAPE_DIRS = new Set(['.claude-plugin', 'agents', 'commands', 'evals', 'hooks', 'skills', 'tests']);
const SHAPE_FILES = new Set(['.mcp.json']);
const SHAPE_RULES = [
  /^agents\/[^/]+\.md$/,
  /^commands\/[^/]+\.md$/,
  /^skills\/[^/]+\/SKILL\.md$/,
  /^skills\/_shared\/[^/]+\.md$/,
  /^hooks\/(hooks\.json|run-hook\.cmd|session-start)$/,
];

/**
 * Shape violations under `root`: unexpected top-level entries, and files under agents/commands/skills/hooks
 * that are not one of the allowed kinds. Returns relative paths.
 */
export function checkShape(root) {
  const v = [];
  for (const entry of fs.readdirSync(root)) {
    if (entry === '.DS_Store') continue;
    const isDir = fs.statSync(path.join(root, entry)).isDirectory();
    if (isDir ? !SHAPE_DIRS.has(entry) : !SHAPE_FILES.has(entry)) v.push(entry);
  }
  for (const dir of ['agents', 'commands', 'skills', 'hooks']) {
    for (const rel of walk(root, dir)) if (!SHAPE_RULES.some((r) => r.test(rel))) v.push(rel);
  }
  return v;
}

function walk(root, rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((n) => n !== '.DS_Store').flatMap((n) => {
    const child = `${rel}/${n}`;
    return fs.statSync(path.join(root, child)).isDirectory() ? walk(root, child) : [child];
  });
}

/** Untracked, non-ignored files under plugins/ai-flow outside evals/ (relative to the repo root). */
export function untrackedOutsideEvals() {
  const out = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'plugins/ai-flow'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out.split('\n').filter((l) => l && !l.startsWith('plugins/ai-flow/evals/'));
}
