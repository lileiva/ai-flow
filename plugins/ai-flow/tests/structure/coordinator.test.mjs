// Coordinator protocol lives on the main thread in skills/using-ai-flow; agents/orchestrator.md is a deprecated stub
// (REQ-006 S1, design D-1, resolved decision R2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, parseFrontmatter } from '../lib/plugin-files.mjs';

const read = (rel) => fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');
const USING = 'skills/using-ai-flow/SKILL.md';
const STUB = 'agents/orchestrator.md';

/** Problems with the deprecated orchestrator stub (R2). */
export function stubProblems(text) {
  const { data, body } = parseFrontmatter(text);
  const p = [];
  if (data.name !== 'orchestrator') p.push('stub name is not orchestrator');
  if (!/^Deprecated \(removed at 4\.0\.0\)/.test(String(data.description ?? ''))) p.push('description does not start "Deprecated (removed at 4.0.0)"');
  const tools = String(data.tools ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (tools.join(',') !== 'Read') p.push(`stub tools are not exactly Read: ${tools.join(',')}`);
  if (body.trim().length > 600) p.push(`stub body is ${body.trim().length} chars, over 600`);
  if (!body.includes('ai-flow:using-ai-flow')) p.push('stub body does not name ai-flow:using-ai-flow');
  return p;
}

test('orchestrator.md is the deprecated stub (R2)', () => {
  assert.deepEqual(stubProblems(read(STUB)), []);
});

test('negative: a full-size orchestrator with Agent in tools is not a stub', () => {
  const bad = `---\nname: orchestrator\ndescription: Coordinates.\ntools: Read, Agent\n---\n${'x'.repeat(700)}\n`;
  assert.equal(stubProblems(bad).length, 4);
});

const SECTIONS = [/DAG/, /Flow Commands/, /Human Gates/, /State/, /Rework/, /Task Escalation/, /Launch Template/];

test('using-ai-flow holds the coordinator sections', () => {
  const hs = [...read(USING).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(SECTIONS.filter((re) => !hs.some((h) => re.test(h))).map(String), []);
});

/** Problems with how using-ai-flow assigns the coordinator role. */
export function coordinatorRoleProblems(text) {
  const p = [];
  if (!/main thread[^.\n]*coordinator|coordinator[^.\n]*main thread/i.test(text)) p.push('does not say the main thread is the coordinator');
  if (/(launch|delegate to|hand[^.\n]*to)[^.\n]*ai-flow:orchestrator/i.test(text)) p.push('hands coordination to ai-flow:orchestrator');
  if (/launch the orchestrator agent/i.test(text)) p.push('launches the orchestrator agent');
  return p;
}

test('using-ai-flow makes the main thread the coordinator and never launches the orchestrator', () => {
  assert.deepEqual(coordinatorRoleProblems(read(USING)), []);
});

test('negative: a copy that launches the orchestrator agent is flagged', () => {
  const bad = `${read(USING)}\nTo start, launch the orchestrator agent.\n`;
  assert.deepEqual(coordinatorRoleProblems(bad), ['launches the orchestrator agent']);
});

// Task 0.6: coordinating apply (REQ-003 S2, REQ-009 S2/S3, design D-4, D-8).
/** The "Coordinating apply" section of using-ai-flow, up to the next heading of the same or higher level. */
export function applySection(text) {
  const m = text.match(/^(#{1,6})\s+Coordinating apply\s*$/m);
  if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(new RegExp(`^#{1,${m[1].length}}\\s`, 'm'));
  return next === -1 ? rest : rest.slice(0, next);
}

test('apply launch carries subagent_type ai-flow:implementer, model and effort', () => {
  const s = applySection(read(USING));
  assert.match(s, /subagent_type[^\n]*ai-flow:implementer/);
  assert.match(s, /model[^\n]*sonnet/i);
  assert.match(s, /effort[^\n]*medium/i);
  assert.match(s, /opus/);
  assert.match(s, /never[^\n]*below sonnet/i);
  assert.match(s, /one (implementer )?instance per task/i);
});
