// CHANGELOG covers every release and marks false claims with dated corrections (REQ-021 S1-S3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/plugin-files.mjs';

const log = () => fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
const RELEASES = ['3.0.0', '3.0.1', '3.0.2', '3.0.3', '3.0.4', '3.1.0', '3.2.0', '3.3.0', '3.4.0', '4.0.0-alpha.1'];
const CORRECTION = '> Correction (4.0.0-alpha.2):';

const headings = (text) => [...text.matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1]);
const missingReleases = (text, versions) => versions.filter((v) => !headings(text).includes(v));

/** The body of one release entry, from its heading to the next release heading. */
function entry(text, version) {
  const start = text.indexOf(`## [${version}]`);
  if (start < 0) return '';
  const next = text.indexOf('\n## [', start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

/** Correction blockquotes in an entry. */
const corrections = (body) => body.split('\n').filter((l) => l.startsWith(CORRECTION));

test('CHANGELOG has an entry for every 3.x release and 4.0.0-alpha.1', () => {
  assert.deepEqual(missingReleases(log(), RELEASES), []);
});

test('every git tag v* has a CHANGELOG entry', () => {
  const tags = spawnSync('git', ['tag', '-l', 'v*'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map((t) => t.slice(1));
  assert.deepEqual(missingReleases(log(), tags), []);
});

test('negative: a CHANGELOG without 3.0.3 is flagged', () => {
  const text = RELEASES.filter((v) => v !== '3.0.3').map((v) => `## [${v}] - x\n`).join('\n');
  assert.deepEqual(missingReleases(text, RELEASES), ['3.0.3']);
});

test('release headings are in descending order', () => {
  const order = headings(log()).filter((v) => RELEASES.includes(v));
  assert.deepEqual(order, [...RELEASES].reverse().filter((v) => order.includes(v)));
});

test('3.0.0: the bundled engram claim says it was removed in 3.0.2', () => {
  const line = entry(log(), '3.0.0').split('\n').find((l) => /\.mcp\.json/.test(l) && /engram/i.test(l)) ?? '';
  assert.match(line, /\(removed in 3\.0\.2\)/);
});

test('3.0.2: records the engram MCP server removal (7fe2387)', () => {
  assert.match(entry(log(), '3.0.2'), /engram[^\n]*\.mcp\.json|\.mcp\.json[^\n]*engram/i);
});

test('3.3.0: the "all 9 agents" fallback claim is followed by a correction, and the entry notes it has no git tag', () => {
  const body = entry(log(), '3.3.0');
  const lines = body.split('\n');
  const i = lines.findIndex((l) => /All 9 agent/i.test(l));
  assert.ok(i >= 0, 'claim kept (no silent rewrite)');
  assert.ok(lines.slice(i + 1, i + 4).some((l) => l.startsWith(CORRECTION)), 'correction right after the claim');
  assert.match(body, /no git tag|not tagged|untagged/i);
});

/** Which of the required 3.4.0 corrections (by topic) are absent. */
function missing340Corrections(body) {
  const cs = corrections(body);
  return [
    ['initializer label', /initializer/i],
    ['unified-doc reviewer reference', /reviewer/i],
    ['AskUserQuestion/superpowers attribution', /AskUserQuestion[\s\S]*superpowers|superpowers[\s\S]*AskUserQuestion/i],
  ].filter(([, re]) => !cs.some((c) => re.test(c))).map(([n]) => n);
}

test('3.4.0: corrections for the initializer label, the unified-doc reviewer reference and the AskUserQuestion attribution', () => {
  assert.deepEqual(missing340Corrections(entry(log(), '3.4.0')), []);
});

test('negative: a 3.4.0 entry without correction blockquotes is flagged', () => {
  assert.deepEqual(missing340Corrections('## [3.4.0]\n- Initializer label corrected\n'), ['initializer label', 'unified-doc reviewer reference', 'AskUserQuestion/superpowers attribution']);
});

// ---- 4.0.0-alpha.2 entry (REQ-021 S4 except the eval summary, REQ-016 S3, REQ-012 S3) ----

/** Required topics an alpha.2 entry body lacks. */
function missingAlpha2Topics(body) {
  return [
    ['skill-sync removal', /skill-sync/],
    ['SessionStart exit 126', /exit 126/],
    ['SessionStart 0 tokens in 3.x', /0 tokens/],
    ['SessionStart ~2.8k tokens', /2\.8k/],
    ['dependencies finding', /`?dependencies`?[\s\S]*optional/i],
    ['Eval comparison subsection', /^### Eval comparison$/m],
  ].filter(([, re]) => !re.test(body)).map(([n]) => n);
}

test('4.0.0-alpha.2 entry covers skill-sync removal, the SessionStart change, the dependencies finding and an Eval comparison subsection', () => {
  assert.deepEqual(missingAlpha2Topics(entry(log(), '4.0.0-alpha.2')), []);
});

test('negative: an alpha.2 entry without the SessionStart and dependencies notes is flagged', () => {
  assert.deepEqual(missingAlpha2Topics('## [4.0.0-alpha.2]\n- Removed skill-sync\n### Eval comparison\n'), ['SessionStart exit 126', 'SessionStart 0 tokens in 3.x', 'SessionStart ~2.8k tokens', 'dependencies finding']);
});

// ---- alpha.2 eval summary (REQ-013 S4, REQ-021 S4) ----

/** The body of one `### <name>` subsection of an entry, up to the next ### heading. */
function subsection(body, name) {
  const start = body.indexOf(`### ${name}\n`);
  if (start < 0) return '';
  const next = body.indexOf('\n### ', start + 1);
  return body.slice(start + name.length + 5, next < 0 ? undefined : next).trim();
}

/** What an Eval comparison subsection lacks: outcome, TDD, SessionStart, the gate SHA; not a placeholder. */
function missingEvalSummary(text) {
  return [
    ['not a placeholder', (t) => t.length > 0 && !/to be filled/i.test(t)],
    ['outcome', (t) => /outcome/i.test(t)],
    ['TDD', (t) => /TDD/.test(t)],
    ['SessionStart', (t) => /SessionStart/.test(t)],
    ['gate SHA', (t) => /\b[0-9a-f]{7,40}\b/.test(t)],
  ].filter(([, ok]) => !ok(text)).map(([n]) => n);
}

test('4.0.0-alpha.2 Eval comparison summarizes outcome, TDD and SessionStart at the gate SHA', () => {
  assert.deepEqual(missingEvalSummary(subsection(entry(log(), '4.0.0-alpha.2'), 'Eval comparison')), []);
});

test('negative: the placeholder Eval comparison is flagged', () => {
  assert.deepEqual(missingEvalSummary('To be filled after the alpha.2 gate.'), ['not a placeholder', 'outcome', 'TDD', 'SessionStart', 'gate SHA']);
});
