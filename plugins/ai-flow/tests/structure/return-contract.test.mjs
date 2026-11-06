// Implementer return contract and per-task loop (REQ-009 S1/S4, REQ-005 S2, design D-7/D-8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from '../lib/plugin-files.mjs';

const IMPLEMENTER = fs.readFileSync(path.join(PLUGIN_ROOT, 'agents/implementer.md'), 'utf8');

const EVIDENCE_FIELDS = [
  'task', 'mode', 'test_files', 'red.command', 'red.failing', 'red.after_test_write',
  'red_before_impl', 'green.summary', 'na_reason', 'verify_command',
];

const section = (text, heading) => {
  const m = text.match(new RegExp(`^## ${heading}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
};

export function checkImplementer(text) {
  const p = [];
  const ret = section(text, 'Return Contract');
  for (const f of EVIDENCE_FIELDS) if (!ret.includes(f)) p.push(`Return Contract missing tdd_evidence field ${f}`);
  const card = section(text, 'Per-task loop');
  const words = card.trim().split(/\s+/).filter(Boolean).length;
  if (!card.trim()) p.push('no Per-task loop card');
  if (words > 160) p.push(`Per-task loop card has ${words} words (max 160)`);
  if (!/before creating any production file, stub or export/i.test(card)) p.push('card lacks the failing-test-first rule');
  if (!/own Bash call/i.test(card)) p.push('card lacks the separate Bash call rule');
  if (!/invert the expectation or stash the implementation/i.test(card)) p.push('card lacks the passing-test proof rule');
  if (/Batch Scoping/i.test(text)) p.push('multi-task Batch Scoping section present');
  if (!/the one task in the launch prompt/i.test(text)) p.push('scope is not "the one task in the launch prompt"');
  if (!/blocked_reason/.test(text) || !/3 failed fix attempts/i.test(text)) p.push('no blocked return after 3 failed fix attempts');
  const stripped = text.replace(/the coordinator launches[^.\n]*/gi, '');
  if (/launch.*debugger|flow-debug/i.test(stripped)) p.push('implementer launches or escalates to the debugger itself');
  return p;
}

test('implementer Return section names every tdd_evidence field (REQ-009 S1)', () => {
  const ret = section(IMPLEMENTER, 'Return Contract');
  for (const f of EVIDENCE_FIELDS) assert.ok(ret.includes(f), `missing ${f}`);
});

test('implementer has a Per-task loop card of at most 160 words with the three rules (REQ-009 S1)', () => {
  const problems = checkImplementer(IMPLEMENTER).filter((m) => /card|Per-task/.test(m));
  assert.deepEqual(problems, []);
});

test('implementer scope is the one task in the launch prompt (REQ-005 S2)', () => {
  assert.deepEqual(checkImplementer(IMPLEMENTER).filter((m) => /scope|Batch Scoping/.test(m)), []);
});

test('implementer returns blocked after 3 failed attempts and never launches the debugger (REQ-009 S4)', () => {
  assert.deepEqual(checkImplementer(IMPLEMENTER).filter((m) => /blocked|debugger/.test(m)), []);
});

test('negative: a copy without the failing-test rule fails the card check', () => {
  const bad = IMPLEMENTER.replace(/before creating any production file, stub or export/gi, 'eventually');
  assert.ok(checkImplementer(bad).some((m) => /failing-test-first/.test(m)));
});

test('negative: a copy that escalates to the debugger itself is reported', () => {
  const bad = IMPLEMENTER + '\nIf stuck, launch the debugger.\n';
  assert.ok(checkImplementer(bad).some((m) => /debugger/.test(m)));
});
