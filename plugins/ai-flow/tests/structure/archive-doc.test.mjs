// unified-ai-dev-flow.md is archived v3 history with its stale claims fixed (REQ-024, REQ-030, REQ-020 S1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/plugin-files.mjs';

const ARCHIVED = 'docs/archive/unified-ai-dev-flow.md';
const ROOT_COPY = 'unified-ai-dev-flow.md';
const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('the unified doc lives under docs/archive/ and the root copy is gone', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, ARCHIVED)), `${ARCHIVED} exists`);
  assert.ok(!fs.existsSync(path.join(REPO_ROOT, ROOT_COPY)), `${ROOT_COPY} removed`);
});

/** Tracked files (other than CHANGELOG.md) whose text links the root path, not docs/archive/. */
function rootLinks(files, readFile) {
  return files.filter((f) => f !== 'CHANGELOG.md' && f !== ARCHIVED && !f.endsWith('archive-doc.test.mjs'))
    .filter((f) => /(^|[^/\w-])unified-ai-dev-flow\.md/m.test(readFile(f).replaceAll(`docs/archive/${ROOT_COPY}`, '')));
}

test('no tracked file outside CHANGELOG.md points at the root unified-ai-dev-flow.md', () => {
  const files = spawnSync('git', ['ls-files', '*.md', '*.mjs', '*.sh', '*.json'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.deepEqual(rootLinks(files, readRepo), []);
});

test('negative: a README linking the root path is flagged; the archive path is not', () => {
  const texts = { 'README.md': `see [doc](${ROOT_COPY})`, 'b.md': `see [doc](docs/archive/${ROOT_COPY})` };
  assert.deepEqual(rootLinks(Object.keys(texts), (f) => texts[f]), ['README.md']);
});

/** Problems with the archived doc's content. */
function archivedProblems(text) {
  const problems = [];
  if (/reviewer sub-?agents?/i.test(text)) problems.push('mentions reviewer sub-agents');
  if (/spec (approval )?gate|approves proposals, specs/i.test(text)) problems.push('lists a spec gate');
  const gates = text.split('\n').find((l) => /\*\*Human review gates/i.test(l)) ?? '';
  for (const g of ['proposal', 'plan', 'tracer', 'verification']) if (!new RegExp(g, 'i').test(gates)) problems.push(`gate principle omits ${g}`);
  const top = text.split('\n').slice(0, 10).join('\n');
  if (!/historical|archived/i.test(top)) problems.push('no archived banner in the top 10 lines');
  if (!/README\.md/.test(top) || !/orchestrator\.md/.test(top)) problems.push('banner does not point to README.md and orchestrator.md');
  if (/(?<![\w:])\/flow-/.test(text)) problems.push('bare /flow- command');
  return problems;
}

test('archived doc: banner, real gates, no reviewer sub-agents, canonical commands', () => {
  assert.deepEqual(archivedProblems(readRepo(ARCHIVED)), []);
});

test('negative: the v3 wording is flagged', () => {
  const v3 = '# AI-Flow\n| 5 | **Human review gates between phases** | x | The developer approves proposals, specs, plans, and verification reports. |\nReviewer sub-agents check.\nRun /flow-apply.\n';
  assert.deepEqual(archivedProblems(v3), [
    'mentions reviewer sub-agents', 'lists a spec gate', 'gate principle omits tracer',
    'no archived banner in the top 10 lines', 'banner does not point to README.md and orchestrator.md', 'bare /flow- command',
  ]);
});

test('README links the archived doc as historical', () => {
  const line = readRepo('README.md').split('\n').find((l) => l.includes(`](${ARCHIVED})`)) ?? '';
  assert.match(line, /historical|archived/i);
});
