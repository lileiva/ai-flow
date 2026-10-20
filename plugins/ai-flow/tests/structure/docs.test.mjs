// Docs truthfulness: README, orchestrator table and manifests agree with the shipped plugin (REQ-011, REQ-020).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, REPO_ROOT, extractHookEngramUrl, findBarePrefixes } from '../lib/plugin-files.mjs';

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
