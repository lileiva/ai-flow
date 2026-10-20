// Shared helpers for the plugin structure suite (tests/structure/*.test.mjs).
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
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

// ---- reference lints (D1 grammar) ----

// A relative agents/... or skills/... path not preceded by `}/` (READ_REF), `/`, `.` or a word char.
const RELATIVE_PATH_RE = /(?:^|[^A-Za-z0-9_/.}-])((?:skills|agents)\/[A-Za-z_][A-Za-z0-9_./-]*)/g;
// A /flow-<x> command without the ai-flow: plugin prefix.
const BARE_PREFIX_RE = /(?:^|[^:A-Za-z0-9_-])(\/flow-[a-z]+)/g;
// ai-flow:<name> (agent, skill or command; the /ai-flow: command form included).
const QUALIFIED_REF_RE = /ai-flow:([a-z][a-z0-9-]*[a-z0-9])/g;

function matchLines(text, re) {
  return text.split('\n').flatMap((l, i) => [...l.matchAll(re)].map((m) => ({ line: i + 1, match: m[1].replace(/[.]+$/, '') })));
}

/** Relative `agents/...` / `skills/...` paths in markdown text, as {line, match}. */
export function findRelativePaths(text) {
  return matchLines(text, RELATIVE_PATH_RE);
}

/** Bare `/flow-<x>` command references (missing the `/ai-flow:` prefix), as {line, match}. */
export function findBarePrefixes(text) {
  return matchLines(text, BARE_PREFIX_RE);
}

/** `ai-flow:<name>` references, as {line, name}. */
export function extractQualifiedRefs(text) {
  return text.split('\n').flatMap((l, i) => [...l.matchAll(QUALIFIED_REF_RE)].map((m) => ({ line: i + 1, name: m[1] })));
}

/** What `ai-flow:<name>` resolves to: 'agent' | 'skill' | 'command', or null. */
export function resolveQualifiedRef(name) {
  if (fs.existsSync(path.join(PLUGIN_ROOT, 'agents', `${name}.md`))) return 'agent';
  if (fs.existsSync(path.join(PLUGIN_ROOT, 'skills', name, 'SKILL.md'))) return 'skill';
  if (fs.existsSync(path.join(PLUGIN_ROOT, 'commands', `${name}.md`))) return 'command';
  return null;
}

/**
 * Drop violations whose line matches an allowlist entry for the same file. Every entry needs a reason.
 * @param {{file: string, line: number}[]} violations
 * @param {{file: string, linePattern: RegExp, reason: string}[]} allowlist
 * @param {string} text the file's text (to read the violating line)
 */
export function applyAllowlist(violations, allowlist, text) {
  for (const e of allowlist) if (!e.reason || !e.reason.trim()) throw new Error(`allowlist entry for ${e.file} has no reason`);
  const lines = text.split('\n');
  return violations.filter((v) => !allowlist.some((e) => e.file === v.file && e.linePattern.test(lines[v.line - 1] ?? '')));
}

/** All reference-lint violations of one file: {file, line, match, rule}. */
export function scan(file, text, allowlist = []) {
  const v = [
    ...findRelativePaths(text).map((x) => ({ file, ...x, rule: 'relative-path' })),
    ...findBarePrefixes(text).map((x) => ({ file, ...x, rule: 'bare-prefix' })),
  ];
  return applyAllowlist(v, allowlist, text);
}

// Phases the evals config does not attribute (agent phase null) but which still have a flow-* skill.
const EXTRA_PHASES = { init: 'initializer', debug: 'debugger' };

/**
 * flow-<phase> skill -> agent name, from evals/tooling/config.json phaseMap (agent -> phase) plus init and debug.
 * @returns {Record<string, string>}
 */
export function loadPhaseMap() {
  const { phaseMap } = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'evals/tooling/config.json'), 'utf8'));
  const pairs = Object.entries(phaseMap).filter(([, phase]) => phase).map(([agent, phase]) => [phase, agent]);
  return Object.fromEntries([...pairs, ...Object.entries(EXTRA_PHASES)].map(([phase, agent]) => [`flow-${phase}`, agent]));
}

/** The engram install URL named by the SessionStart hook's warning. */
export function extractHookEngramUrl(hookText) {
  return /https:\/\/github\.com\/[^\s"]+engram/.exec(hookText)?.[0] ?? '';
}

/**
 * Run `claude plugin validate` on a temp copy of the plugin (evals/ excluded: large, not part of the manifest).
 * @param {(dir: string) => void} [mutate] edits the copy before validating
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
export function validatePluginCopy(mutate = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-validate-'));
  try {
    fs.cpSync(PLUGIN_ROOT, dir, { recursive: true, filter: (src) => !src.startsWith(path.join(PLUGIN_ROOT, 'evals')) });
    mutate(dir);
    return spawnSync('claude', ['plugin', 'validate', dir], { encoding: 'utf8', timeout: 60000 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
