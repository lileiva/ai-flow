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

const PACK_PLACEHOLDERS = [/Project/, /Change/, /Repo/, /Task id/i, /plan key/i, /scenarios?\/decisions|cited scenarios/i, /test command/i, /Completed tasks/i, /TDD mode/i, /Return the tdd_evidence block/i];
const BATCH_WORDING = [/at the end/i, /after each batch/i, /all batches/i, /Execute Batches/i];

/** Problems with the apply task pack and the evidence check. */
export function applyPackProblems(text) {
  const s = applySection(text);
  const p = [];
  for (const re of PACK_PLACEHOLDERS) if (!re.test(s)) p.push(`task pack lacks ${re}`);
  for (const re of BATCH_WORDING) if (re.test(s)) p.push(`batch-style wording ${re}`);
  for (const f of ['test_files', 'red.failing', 'red.after_test_write', 'red_before_impl', 'green.summary', 'verify_command']) {
    if (!s.includes(f)) p.push(`evidence check lacks ${f}`);
  }
  if (!/mode[^\n]*n\/a[^\n]*reason/i.test(s)) p.push('evidence check lacks n/a mode reason');
  if (!/re-establish RED/i.test(s) || !/one (routing )?step up/i.test(s)) p.push('no single relaunch one step up');
  if (!/second miss[^\n]*warning[^\n]*(next )?gate/i.test(s)) p.push('second miss is not a warning at the next gate');
  if (!/tracer[^\n]*gate|gate[^\n]*tracer/i.test(s)) p.push('batch 0 tracer gate missing');
  return p;
}

test('apply task pack, evidence check and tracer gate are present (REQ-009 S2/S3)', () => {
  assert.deepEqual(applyPackProblems(read(USING)), []);
});

test('negative: a pack that runs tests "at the end" is flagged', () => {
  const bad = read(USING).replace(/(### Coordinating apply\n)/, '$1\nRun `npm test` at the end.\n');
  assert.ok(applyPackProblems(bad).includes('batch-style wording /at the end/i'));
});

test('apply is per-task: no batch-launch wording remains in using-ai-flow (Task 0.5 leftovers)', () => {
  const t = read(USING);
  assert.doesNotMatch(t, /launch implementer agents in batches/i);
  assert.doesNotMatch(t, /TDD implementation in batches/i);
  assert.doesNotMatch(t, /execute the remaining batches/i);
});

test('apply records evidence under a per-task key, not the shared apply-progress key', () => {
  const s = applySection(read(USING));
  assert.match(s, /flow\/\{change(-name)?\}\/apply-evidence-\{task_id\}/);
  assert.match(s, /handback/i);
  assert.match(s, /backup/i);
  assert.match(s, /upsert|overwrit/i);
});

// Task 0.7: thin flow-apply entry point (REQ-008 S1, REQ-018 S1, design D-2).
const FLOW_APPLY = 'skills/flow-apply/SKILL.md';

test('flow-apply has disable-model-invocation: true (REQ-008 S1)', () => {
  const { data } = parseFrontmatter(read(FLOW_APPLY));
  assert.equal(String(data['disable-model-invocation']), 'true');
});

const norm = (l) => l.toLowerCase().replace(/^\s*(\d+\.|[-*])\s*/, '').replace(/\s+/g, ' ').trim();

/** Problems with a thin phase skill body (REQ-018 S1, REQ-008 S1). `agentText` is the agent file it must not duplicate. */
export function thinSkillProblems(text, agentText, phase = 'apply') {
  const { body } = parseFrontmatter(text);
  const lines = body.split('\n').filter((l) => l.trim());
  const p = [];
  if (lines.length > 8) p.push(`body has ${lines.length} non-empty lines, over 8`);
  if (!body.includes('ai-flow:using-ai-flow')) p.push('does not name ai-flow:using-ai-flow');
  if (phase === 'apply') {
    if (!/Coordinating apply/.test(body)) p.push('does not name the Coordinating apply section');
  } else if (!new RegExp(`\\\`${phase}\\\` row`).test(body)) p.push(`does not name its \`${phase}\` row`);
  if (/AskUserQuestion/.test(body)) p.push('AskUserQuestion wording');
  if (/orchestrator\s+MUST/i.test(body)) p.push('orchestrator MUST wording');
  if (/OpenSpace/i.test(body)) p.push('OpenSpace block');
  const agentLines = new Set(agentText.split('\n').map(norm).filter((l) => l.length > 20));
  const shared = lines.map(norm).filter((l) => l.length > 20 && agentLines.has(l));
  if (shared.length >= 4) p.push(`shares ${shared.length} lines with the agent`);
  if (/Read and follow/i.test(body)) p.push('Read and follow wording');
  return p;
}

// Task 2.4: all 10 flow-* skills are thin, user-only entry points (REQ-008 S1, REQ-018 S1, REQ-021 S1, D-2).
const PHASE_AGENT = { init: 'initializer', explore: 'explorer', propose: 'proposer', spec: 'specifier', design: 'designer', plan: 'planner', apply: 'implementer', verify: 'verifier', archive: 'archivist', debug: 'debugger' };

/** Problems with the frontmatter of a user-only phase skill (REQ-008 S1). */
export function userOnlyProblems(text) {
  const { data } = parseFrontmatter(text);
  return String(data['disable-model-invocation']) === 'true' ? [] : ['missing disable-model-invocation: true'];
}

for (const [phase, agent] of Object.entries(PHASE_AGENT)) {
  const file = `skills/flow-${phase}/SKILL.md`;
  test(`phase skill is user-only and thin: flow-${phase} (REQ-008 S1, REQ-018 S1)`, () => {
    assert.deepEqual(userOnlyProblems(read(file)), []);
    assert.deepEqual(thinSkillProblems(read(file), read(`agents/${agent}.md`), phase), []);
    assert.match(read(file), new RegExp(`ai-flow:${agent}`), 'names its agent');
  });
}

test('negative: a phase skill without disable-model-invocation, or with a copied explorer question list, is flagged', () => {
  assert.deepEqual(userOnlyProblems('---\nname: flow-x\ndescription: d\n---\nbody\n'), ['missing disable-model-invocation: true']);
  const bad = '---\nname: flow-explore\n---\nLoad ai-flow:using-ai-flow.\nAsk the user via AskUserQuestion.\nIf OpenSpace is connected, search.\n';
  const p = thinSkillProblems(bad, '', 'explore');
  for (const re of [/`explore` row/, /AskUserQuestion/, /OpenSpace/]) assert.ok(p.some((x) => re.test(x)), String(re));
});

test('flow-apply is a thin entry point (REQ-018 S1, REQ-008 S1)', () => {
  assert.deepEqual(thinSkillProblems(read(FLOW_APPLY), read('agents/implementer.md')), []);
});

test('negative: a fat flow-apply with OpenSpace and orchestrator MUST is flagged', () => {
  const bad = `---\nname: x\n---\n${Array.from({ length: 9 }, (_, i) => `line ${i}`).join('\n')}\nThe orchestrator MUST auto-launch verify.\n## OpenSpace Integration\nRead and follow the agent.\n`;
  const p = thinSkillProblems(bad, '');
  for (const re of [/over 8/, /using-ai-flow/, /Coordinating apply/, /orchestrator MUST/, /OpenSpace/, /Read and follow/]) assert.ok(p.some((x) => re.test(x)), String(re));
});

test('negative: a skill that copies four implementer lines is flagged', () => {
  const agent = ['Read plan, spec and design from engram first', 'Execute each task test-first following the guide', 'Track progress in engram under the apply key', 'Return the evidence block with the envelope'].join('\n');
  const bad = `---\nname: x\n---\nai-flow:using-ai-flow Coordinating apply\n${agent.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n')}\n`;
  assert.ok(thinSkillProblems(bad, agent).some((x) => /shares 4 lines/.test(x)));
});

// Task 2.1: routing table, escalation rule and launch template (REQ-003 S1/S2, REQ-002 S1, design D-4).
const PHASES = ['init', 'explore', 'propose', 'spec', 'design', 'plan', 'apply', 'verify', 'archive', 'debug'];
const MODELS = ['haiku', 'sonnet', 'opus'];
const EFFORTS = ['low', 'medium', 'high', 'max'];
/** D-4 defaults: phase -> [model, effort]. */
const D4_DEFAULTS = { init: ['haiku', 'low'], explore: ['sonnet', 'medium'], propose: ['sonnet', 'medium'], spec: ['sonnet', 'medium'], design: ['sonnet', 'high'], plan: ['sonnet', 'medium'], apply: ['sonnet', 'medium'], verify: ['sonnet', 'medium'], archive: ['haiku', 'low'], debug: ['opus', 'high'] };

/** Text of the section with the given heading, up to the next heading of the same or higher level. */
export function sectionOf(text, title) {
  const m = text.match(new RegExp(`^(#{1,6})\\s+${title}\\s*$`, 'm'));
  if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(new RegExp(`^#{1,${m[1].length}}\\s`, 'm'));
  return next === -1 ? rest : rest.slice(0, next);
}

/** Problems with the Routing table: a row per phase, model and effort from the allowed sets, D-4 defaults. */
export function routingTableProblems(text) {
  const s = sectionOf(text, 'Routing');
  if (!s) return ['no Routing section'];
  const rows = s.split('\n').filter((l) => l.trim().startsWith('|'));
  const p = [];
  for (const ph of PHASES) {
    const row = rows.find((l) => new RegExp(`^\\|\\s*${ph}\\b`, 'i').test(l));
    if (!row) { p.push(`no routing row for ${ph}`); continue; }
    const m = row.match(/\b(haiku|sonnet|opus)\/(low|medium|high|max)\b/);
    if (!m) { p.push(`row ${ph} lacks a model/effort default`); continue; }
    if (!MODELS.includes(m[1]) || !EFFORTS.includes(m[2])) p.push(`row ${ph} has a model or effort outside the allowed sets`);
    if (m[1] !== D4_DEFAULTS[ph][0] || m[2] !== D4_DEFAULTS[ph][1]) p.push(`row ${ph} default ${m[0]} differs from D-4`);
  }
  return p;
}

test('Routing table has a row per phase agent with D-4 defaults (REQ-003 S1)', () => {
  assert.deepEqual(routingTableProblems(read(USING)), []);
});

test('negative: removing the verifier row fails the routing table check', () => {
  const bad = read(USING).split('\n').filter((l) => !/^\|\s*verify\b/i.test(l)).join('\n');
  assert.deepEqual(routingTableProblems(bad), ['no routing row for verify']);
});

/** Problems with the escalation rule inside Routing. */
export function escalationProblems(text) {
  const s = sectionOf(text, 'Routing');
  const p = [];
  if (!/apply[^\n]*(blocked|evidence)/i.test(s) && !/(blocked|evidence)[^\n]*apply/i.test(s)) p.push('escalation does not name apply raised after blocked or an evidence miss');
  if (!/never[^\n]*below sonnet/i.test(s)) p.push('no "never lower apply below sonnet"');
  if (!/user[^\n]*(instruction|override)[^\n]*(overrid|wins|takes)|overrid[^\n]*user|user instruction/i.test(s)) p.push('no user-instruction override');
  return p;
}

test('escalation rule: raise apply after blocked or evidence miss, never below sonnet, user overrides (REQ-003 S2)', () => {
  assert.deepEqual(escalationProblems(read(USING)), []);
});

test('negative: a Routing section without the below-sonnet rule is flagged', () => {
  const bad = read(USING).replace(/never[^\n]*below sonnet[^\n]*/gi, 'lower it freely.');
  assert.ok(escalationProblems(bad).some((x) => /below sonnet/.test(x)));
});

/** Problems with the launch template: subagent_type, model, effort, description, routing_log. */
export function launchTemplateProblems(text) {
  const s = sectionOf(text, 'Sub-Agent Launch Template');
  if (!s) return ['no Sub-Agent Launch Template section'];
  const p = [];
  if (!/subagent_type[^\n]*ai-flow:\{agent\}/.test(s)) p.push('no subagent_type ai-flow:{agent}');
  if (!/\bmodel\b/.test(s)) p.push('no model');
  if (!/\beffort\b/.test(s)) p.push('no effort');
  if (!/\bdescription\b/.test(s)) p.push('no description');
  if (!/routing_log/.test(s) || !/phase[^\n]*model[^\n]*effort[^\n]*reason/.test(s)) p.push('does not append {phase, task?, model, effort, reason} to routing_log');
  if (/Read and follow|flow-\{phase\}\/SKILL/.test(s.replace(/do not tell[^\n]*/i, ''))) p.push('tells the agent to read a skill file');
  return p;
}

test('one launch template carries subagent_type, model, effort, description and logs the routing choice (REQ-003 S2)', () => {
  assert.deepEqual(launchTemplateProblems(read(USING)), []);
});

test('negative: a template without effort and routing_log is flagged', () => {
  const t = read(USING);
  const m = t.match(/^### Sub-Agent Launch Template\s*$/m);
  const bad = `${t.slice(0, m.index)}### Sub-Agent Launch Template\n\nLaunch with subagent_type \`ai-flow:{agent}\` and a model.\n`;
  const p = launchTemplateProblems(bad);
  assert.ok(p.some((x) => /effort/.test(x)) && p.some((x) => /routing_log/.test(x)));
});

test('no agent frontmatter pins model or effort (REQ-002 S1)', () => {
  const dir = path.join(PLUGIN_ROOT, 'agents');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const { data } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(!('model' in data) && !('effort' in data), `${f} pins model or effort`);
  }
});

// Task 2.2: real gates, no phase work on the main thread, no phase-skill loads (REQ-006 S1, REQ-007 S1, REQ-008 S1, design D-1).
const GATES = [/proposal/i, /plan/i, /tracer/i, /verif/i];

/** Problems with the Human Gates section: four gates with options, a real wait, the unattended line, state.gates. */
export function gateProblems(text) {
  const s = sectionOf(text, 'Human Gates');
  if (!s) return ['no Human Gates section'];
  const rows = s.split('\n').filter((l) => l.trim().startsWith('|')).slice(2);
  const p = [];
  if (rows.length !== 4) p.push(`gates table has ${rows.length} rows, not 4`);
  for (const re of GATES) {
    const row = rows.find((l) => re.test(l.split('|')[1] ?? ''));
    if (!row) p.push(`no gate row for ${re}`);
    else if (!/\w[^|]*\/[^|]*\w\s*\|?\s*$/.test(row)) p.push(`gate ${re} lists no options`);
  }
  if (!/AskUserQuestion/.test(s) || !/end (your|the) turn/i.test(s)) p.push('gate does not say to ask via AskUserQuestion or end the turn');
  if (!/wait[^\n]*answer|answer[^\n]*before/i.test(s) || !/later phase/i.test(s)) p.push('gate does not say to wait for the answer before launching a later phase');
  if (!/AUTO-APPROVED GATE: <gate>/.test(s) || !/unattended/i.test(s)) p.push('no AUTO-APPROVED GATE line under the unattended policy');
  if (!/state\.gates/.test(text)) p.push('gate results are not recorded in state.gates');
  return p;
}

test('Human Gates: four gates with options that stop and wait for the user (REQ-007 S1)', () => {
  assert.deepEqual(gateProblems(read(USING)), []);
});

test('negative: a Human Gates section without the wait rule is flagged', () => {
  const t = read(USING);
  const bad = t.replace("and wait for the user's answer before launching an agent of a later phase", 'and go on').replace(/AUTO-APPROVED GATE: <gate>/g, 'x');
  const p = gateProblems(bad);
  assert.ok(p.some((x) => /wait/.test(x)) && p.some((x) => /AUTO-APPROVED/.test(x)));
});

/** Problems with the coordinator doing phase work (REQ-006 S1). */
export function noPhaseWorkProblems(text) {
  const p = [];
  if (!/(do not|never|does not)[^\n]*(write|edit)[^\n]*(project )?source[^\n]*test files/i.test(text)) p.push('no ban on writing project source or test files');
  if (!/(do not|never|does not)[^\n]*author[^\n]*artifact|artifact[^\n]*(is|are) written by the (phase )?agent/i.test(text)) p.push('no ban on authoring phase artifacts');
  return p;
}

test('the coordinator does no phase work: no source/test writes, no artifact authoring (REQ-006 S1)', () => {
  assert.deepEqual(noPhaseWorkProblems(read(USING)), []);
});

/** Problems with instructions to load a flow-* phase skill through the Skill tool (REQ-008 S1). */
export function phaseSkillLoadProblems(text) {
  const p = [];
  for (const l of text.split('\n')) {
    if (/\b(do not|don't|never|not)\b/i.test(l)) continue;
    if (/ai-flow:flow-\w+/.test(l) && /Skill tool/i.test(l)) p.push(`loads a phase skill with the Skill tool: ${l.trim()}`);
  }
  if (!/launch the phase agent/i.test(text)) p.push('does not say to launch the phase agent');
  return p;
}

test('the coordinator launches phase agents and does not load phase skills (REQ-008 S1)', () => {
  assert.deepEqual(phaseSkillLoadProblems(read(USING)), []);
});

test('negative: a copy that loads ai-flow:flow-apply with the Skill tool is flagged', () => {
  const bad = `${read(USING)}\nTo apply, load ai-flow:flow-apply with the Skill tool.\n`;
  assert.equal(phaseSkillLoadProblems(bad).length, 1);
});

// Task 2.3: status handling (REQ-004 S3, REQ-005 S3, design D-6, D-7).
test('using-ai-flow handles needs_input and blocked statuses', () => {
  const s = sectionOf(read(USING), 'Handling returns');
  assert.ok(s, 'no Handling returns section');
  assert.match(s, /needs_input/);
  assert.match(s, /blocked/);
});

/** Problems with the question round, blocked routing and the no-nesting rule (REQ-004 S3, REQ-005 S3). */
export function returnHandlingProblems(text) {
  const s = sectionOf(text, 'Handling returns');
  const p = [];
  if (!/blocking[^\n]*open_questions|open_questions[^\n]*blocking/i.test(s)) p.push('no rule for blocking open_questions');
  if (!/merge[^\n]*one AskUserQuestion round/i.test(s)) p.push('questions are not merged into one AskUserQuestion round');
  if (!/(4|four) (questions )?per call/i.test(s) || !/recommended option first/i.test(s)) p.push('no 4-per-call limit with the recommended option first');
  if (!/relaunch[^\n]*same agent type[^\n]*fresh[^\n]*Answers:/i.test(s)) p.push('no fresh relaunch of the same agent type with an "Answers:" block');
  if (!/non-blocking[^\n]*next gate/i.test(s)) p.push('non-blocking questions are not shown at the next gate');
  if (!/unattended[^\n]*recommended[^\n]*ASSUMED ANSWER:/i.test(s)) p.push('no ASSUMED ANSWER line under the unattended policy');
  if (!/blocked[^\n]*ai-flow:debugger[^\n]*opus[^\n]*high/i.test(s) || !/task id/i.test(s) || !/evidence/i.test(s) || !/apply-progress/i.test(s)) p.push('blocked does not launch ai-flow:debugger (opus/high) with task id, evidence and apply-progress key');
  if (!/debugger[^\n]*ok[^\n]*fresh implementer[^\n]*one routing step up/i.test(s)) p.push('no fresh implementer one routing step up after debugger ok');
  if (!/debugger[^\n]*blocked[^\n]*question to the user/i.test(s)) p.push('debugger blocked does not go to the user as a question');
  if (!/no (sub-?agent|agent)[^\n]*launch[^\n]*(another )?phase agent|(sub-?agents?|agents?) (do not|never|must not) launch[^\n]*agent/i.test(text)) p.push('no rule that a subagent never launches another phase agent');
  return p;
}

test('Handling returns: question round, blocked -> debugger, no nested launches (REQ-004 S3, REQ-005 S3)', () => {
  assert.deepEqual(returnHandlingProblems(read(USING)), []);
});

test('negative: Handling returns without the question round or the debugger route is flagged', () => {
  const bad = read(USING).replace(/### Handling returns[\s\S]*?(?=### DAG State Updates)/, '### Handling returns\n\nneeds_input and blocked: decide.\n\n');
  assert.ok(returnHandlingProblems(bad).length >= 8);
});
