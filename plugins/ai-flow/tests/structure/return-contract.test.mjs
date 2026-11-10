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

// ---- Envelope v2 (REQ-017 S1, REQ-005 S1, REQ-004 S2; design D-10/D-11; plan R3) ----

const ENVELOPE_FIELDS = ['status', 'executive_summary', 'artifacts', 'next_recommended', 'risks', 'open_questions', 'blocked_reason', 'evidence'];
const STATUS_ENUM = ['ok', 'partial', 'needs_input', 'blocked', 'error'];
const OPEN_QUESTION_FIELDS = ['id', 'question', 'why', 'options', 'recommended', 'blocking'];
const STATE_FIELDS = ['gates', 'pending_questions', 'routing_log'];

const CONTRACT = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills/_shared/persistence-contract.md'), 'utf8');
const CONVENTION = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills/_shared/engram-convention.md'), 'utf8');

/** The names on the line "Envelope fields: `a`, `b`, ..." of a doc. */
const envelopeFieldList = (text) => {
  const line = text.split('\n').find((l) => /^Envelope fields:/.test(l));
  return line ? [...line.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]) : [];
};

export function checkContract(text) {
  const p = [];
  const got = envelopeFieldList(text);
  if (JSON.stringify(got) !== JSON.stringify(ENVELOPE_FIELDS)) p.push(`persistence-contract envelope fields are [${got}]`);
  if (!new RegExp(`status\\W+${STATUS_ENUM.join('\\W+')}`).test(text)) p.push('status enum is not ok | partial | needs_input | blocked | error');
  if (/\bwarning\b[^\n]*\bfailed\b|"ok \| warning/.test(text)) p.push('stale status enum (warning/failed)');
  for (const f of OPEN_QUESTION_FIELDS) if (!new RegExp(`\\b${f}\\b`).test(text)) p.push(`open_questions shape lacks ${f}`);
  if (!/blocked_reason[^\n]*(required|must)[^\n]*blocked|blocked[^\n]*blocked_reason[^\n]*required/i.test(text)) p.push('blocked_reason is not required when status is blocked');
  if (!/evidence\.tdd_evidence/.test(text)) p.push('tdd_evidence location is not fixed at evidence.tdd_evidence');
  if (!/not (in )?(a )?(markdown|prose)|never[^\n]*(markdown|prose)/i.test(text)) p.push('does not forbid tdd_evidence in prose or a markdown block');
  if (/AskUserQuestion/.test(text)) p.push('mentions AskUserQuestion (subagents never ask the user)');
  return p;
}

export function checkConvention(text) {
  const p = [];
  const got = envelopeFieldList(text);
  if (JSON.stringify(got) !== JSON.stringify(ENVELOPE_FIELDS)) p.push(`engram-convention envelope fields are [${got}]`);
  for (const f of STATE_FIELDS) if (!text.includes(f)) p.push(`state section lacks ${f}`);
  for (const w of ['coordinator', 'proposer', 'archivist']) if (!new RegExp(`\\b${w}\\b`).test(text)) p.push(`state writers lack the ${w}`);
  return p;
}

test('persistence-contract defines the v2 envelope with a single tdd_evidence location (REQ-017 S1, REQ-005 S1)', () => {
  assert.deepEqual(checkContract(CONTRACT), []);
});

test('engram-convention lists the same envelope fields as persistence-contract (REQ-017 S1)', () => {
  assert.deepEqual(envelopeFieldList(CONVENTION), envelopeFieldList(CONTRACT));
  assert.deepEqual(envelopeFieldList(CONVENTION), ENVELOPE_FIELDS);
});

test('engram-convention state adds gates, pending_questions, routing_log and keeps the writers (REQ-004 S2)', () => {
  assert.deepEqual(checkConvention(CONVENTION), []);
});

test('persistence-contract gives subagents no AskUserQuestion instruction (REQ-005 S1)', () => {
  assert.ok(!/AskUserQuestion/.test(CONTRACT));
});

test('the implementer example puts tdd_evidence at evidence.tdd_evidence, matching the contract', () => {
  assert.match(IMPLEMENTER, /evidence\.tdd_evidence/);
});

test('negative: a contract without blocked_reason fails', () => {
  const bad = CONTRACT.replace(/blocked_reason/g, 'blocked_note');
  assert.ok(checkContract(bad).some((m) => /blocked_reason|envelope fields/.test(m)));
});
