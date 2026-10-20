// Docs truthfulness: README, orchestrator table and manifests agree with the shipped plugin (REQ-011, REQ-020).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, REPO_ROOT, extractHookEngramUrl, findBarePrefixes, listRuntimeMd } from '../lib/plugin-files.mjs';

const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readPlugin = (rel) => fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');

test('README and hook are readable; the hook names an engram URL', () => {
  assert.ok(readRepo('README.md').length > 0);
  assert.match(extractHookEngramUrl(readPlugin('hooks/session-start')), /^https:\/\/github\.com\/\S+engram$/);
});

// ---- engram is a separate install, not bundled (REQ-011 S1, S2) ----

const urlsIn = (text) => (text.match(/https?:\/\/[^\s)>"'`]+/g) ?? []).map((u) => u.replace(/[.,;:]+$/, ''));

/** Problems with what a README says about engram, given the URL the hook tells users to install from. */
function engramClaimProblems(readme, hookUrl) {
  const problems = [];
  readme.split('\n').forEach((l, i) => {
    if (/engram/i.test(l) && /bundl/i.test(l)) problems.push(`line ${i + 1}: claims engram is bundled`);
    if (/\.mcp\.json/.test(l) && /engram/i.test(l) && !/empty/i.test(l)) problems.push(`line ${i + 1}: claims .mcp.json configures engram`);
  });
  if (!readme.includes(hookUrl)) problems.push(`missing the hook's engram URL ${hookUrl}`);
  for (const u of urlsIn(readme).filter((u) => /engram/i.test(u) && u !== hookUrl)) problems.push(`other engram URL ${u}`);
  return problems;
}

const hookUrl = () => extractHookEngramUrl(readPlugin('hooks/session-start'));

test('README: engram is a separate install at the hook URL, not bundled via .mcp.json', () => {
  assert.deepEqual(engramClaimProblems(readRepo('README.md'), hookUrl()), []);
});

test('.mcp.json declares no MCP servers (so nothing is bundled)', () => {
  assert.deepEqual(JSON.parse(readPlugin('.mcp.json')).mcpServers, {});
});

test('negative: a README claiming engram is bundled via .mcp.json is flagged', () => {
  const url = 'https://github.com/gentleman-programming/engram';
  const bad = `- [Engram](${url}) for persistence (bundled via \`.mcp.json\`)\n`;
  assert.deepEqual(engramClaimProblems(bad, url), ['line 1: claims engram is bundled', 'line 1: claims .mcp.json configures engram']);
});

test('negative: a README pointing at another engram repo is flagged', () => {
  const url = 'https://github.com/gentleman-programming/engram';
  const bad = `Install [engram](https://github.com/anthropics/engram), see also ${url}.\n`;
  assert.deepEqual(engramClaimProblems(bad, url), ['other engram URL https://github.com/anthropics/engram']);
});

// ---- the initializer writes .ai-flow.json, so it is not labelled read-only (REQ-011 S4, REQ-020 S1) ----

/** Problems with the initializer row of a markdown agents table. */
function initializerRowProblems(text) {
  const row = text.split('\n').find((l) => /^\|/.test(l) && /`initializer`/.test(l));
  if (!row) return ['no initializer row'];
  const problems = [];
  if (/read-only/i.test(row)) problems.push('initializer labelled Read-only');
  if (!/Writes `\.ai-flow\.json`/.test(row)) problems.push('initializer row does not say it writes `.ai-flow.json`');
  return problems;
}

for (const [label, read] of [['README.md', () => readRepo('README.md')], ['agents/orchestrator.md', () => readPlugin('agents/orchestrator.md')]]) {
  test(`${label}: initializer row says it writes .ai-flow.json and is not Read-only`, () => {
    assert.deepEqual(initializerRowProblems(read()), []);
  });
}

test('negative: an initializer row labelled Read-only is flagged', () => {
  assert.deepEqual(initializerRowProblems('| `initializer` | 0 | Read-only | Detects stack |\n'), [
    'initializer labelled Read-only',
    'initializer row does not say it writes `.ai-flow.json`',
  ]);
});

// ---- README uses canonical /ai-flow:flow-* commands (REQ-006 S1, REQ-018 S1) ----

test('README has no bare /flow- command', () => {
  assert.deepEqual(findBarePrefixes(readRepo('README.md')), []);
});

// ---- README Project Structure tree matches the shipped plugin (REQ-011 S3, REQ-020 S1) ----

/** The text of a markdown section, from its `## ` heading to the next `## ` heading. */
function mdSection(text, heading) {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start < 0) return '';
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

const firstFence = (text, lang = '') => new RegExp('```' + lang + '\\n([\\s\\S]*?)```').exec(text)?.[1] ?? '';

/** Repo-relative paths of a 2-space-indented tree ("dir/" entries nest, "# ..." comments ignored). */
function parseTree(tree) {
  const stack = [];
  const paths = [];
  for (const line of tree.split('\n')) {
    const m = /^( *)([^\s#][^\s]*)/.exec(line);
    if (!m) continue;
    const depth = m[1].length / 2;
    stack.length = depth;
    const full = [...stack, m[2]].join('').replace(/\/$/, '');
    paths.push(full);
    if (m[2].endsWith('/')) stack.push(m[2]);
  }
  return paths;
}

const TREE_REQUIRED_EXTRA = ['plugins/ai-flow/tests/run.sh', 'plugins/ai-flow/tests/structure', 'plugins/ai-flow/evals', 'plugins/ai-flow/.mcp.json', 'plugins/ai-flow/.claude-plugin/plugin.json'];
const TREE_FORBIDDEN = /skill-sync|(^|\/)scripts(\/|$)|sync\.sh/;

/** Problems with a README tree, given the files that must be shown and a path-exists predicate. */
function treeProblems(tree, required, exists) {
  const paths = parseTree(tree);
  return [
    ...paths.filter((p) => !exists(p)).map((p) => `listed but missing: ${p}`),
    ...paths.filter((p) => TREE_FORBIDDEN.test(p)).map((p) => `retired path listed: ${p}`),
    ...required.filter((r) => !paths.includes(r)).map((r) => `not listed: ${r}`),
  ];
}

const shippedRuntime = () => [
  ...listRuntimeMd(),
  'hooks/hooks.json', 'hooks/run-hook.cmd', 'hooks/session-start',
].map((f) => `plugins/ai-flow/${f}`);
const existsInRepo = (p) => fs.existsSync(path.join(REPO_ROOT, p));
const readmeTree = () => firstFence(mdSection(readRepo('README.md'), 'Project Structure'));

test('README Project Structure tree lists every shipped runtime file, tests and evals, and nothing retired or missing', () => {
  assert.deepEqual(treeProblems(readmeTree(), [...shippedRuntime(), ...TREE_REQUIRED_EXTRA], existsInRepo), []);
});

test('negative: a tree listing skill-sync/ is flagged', () => {
  const tree = 'plugins/ai-flow/\n  skills/\n    skill-sync/SKILL.md   # retired\n';
  assert.deepEqual(treeProblems(tree, [], () => true), ['retired path listed: plugins/ai-flow/skills/skill-sync/SKILL.md']);
});

// ---- README relative links resolve (REQ-004 S1) ----

const relativeLinks = (text) => [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
  .filter((u) => !/^(https?:|mailto:|#)/.test(u)).map((u) => u.replace(/#.*$/, ''));

test('every relative markdown link in README resolves to a repo file', () => {
  assert.deepEqual(relativeLinks(readRepo('README.md')).filter((u) => !existsInRepo(u)), []);
});

// ---- .ai-flow.json schema: documented, written by the initializer, read by the guide (REQ-025, REQ-014 S6) ----

/** Backticked keys that runtime md says it reads from `.ai-flow.json` (same line; table rows name agents, not keys). */
function aiFlowJsonKeysRead(files, readFile) {
  const keys = new Set();
  for (const f of files) {
    for (const line of readFile(f).split('\n').filter((l) => l.includes('`.ai-flow.json`') && !/^\s*\|/.test(l))) {
      for (const [, k] of line.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)) keys.add(k);
    }
  }
  return [...keys].sort();
}

const readmeConfigExample = () => JSON.parse(firstFence(mdSection(readRepo('README.md'), 'Configuration'), 'json'));
const initializerExample = () => JSON.parse(firstFence(mdSection(readPlugin('agents/initializer.md'), '`.ai-flow.json` Configuration'), 'json'));

test('runtime md reads at least testRunner from .ai-flow.json', () => {
  assert.ok(aiFlowJsonKeysRead(listRuntimeMd(), readPlugin).includes('testRunner'));
});

test('README and initializer.md show the same .ai-flow.json example', () => {
  assert.deepEqual(readmeConfigExample(), initializerExample());
});

/** Keys read by runtime md that the documented example omits. */
const undocumentedKeys = (example, keysRead) => keysRead.filter((k) => !(k in example));

test('every key runtime md reads from .ai-flow.json is in the README example', () => {
  assert.deepEqual(undocumentedKeys(readmeConfigExample(), aiFlowJsonKeysRead(listRuntimeMd(), readPlugin)), []);
});

test('negative: an example without testRunner is flagged', () => {
  assert.deepEqual(undocumentedKeys({}, ['testRunner']), ['testRunner']);
});

test('initializer writes the detected test command to testRunner and omits it when none is detected', () => {
  const t = readPlugin('agents/initializer.md');
  assert.match(t, /`testRunner`/);
  assert.match(t, /omit[^.\n]*`?testRunner`?[^.\n]*(no|nothing)[^.\n]*detected|(no|nothing)[^.\n]*detected[^.\n]*omit/i);
  assert.match(t, /already exists[^.\n]*(add|adds) only (the )?missing keys/i);
});

// ---- SessionStart gap is documented as fixed (REQ-020 S2) ----

for (const [label, read] of [['README.md Evals', () => mdSection(readRepo('README.md'), 'Evals')], ['evals/README.md', () => readPlugin('evals/README.md')]]) {
  test(`${label} known gaps say the exit-126 hook gap is fixed in 4.0.0-alpha.2`, () => {
    const gap = read().split('\n').find((l) => /126/.test(l)) ?? '';
    assert.match(gap, /fixed in 4\.0\.0-alpha\.2/);
  });
}

test('README Hooks section describes the SessionStart hook', () => {
  assert.match(mdSection(readRepo('README.md'), 'Hooks'), /SessionStart[\s\S]*using-ai-flow/);
});
