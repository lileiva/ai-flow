// Coordinator protocol lives on the main thread in skills/using-ai-flow; agents/orchestrator.md is a deprecated stub
// (REQ-006 S1, design D-1, resolved decision R2).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, parseFrontmatter, resolveQualifiedRef } from '../lib/plugin-files.mjs';

const read = (rel) => fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');
const USING = 'skills/using-ai-flow/SKILL.md';
const STUB = 'agents/orchestrator.md';
const APPLY_DETAIL = 'skills/coordinating-apply/SKILL.md';
const COMMANDS_DETAIL = 'skills/coordinating-commands/SKILL.md';

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

const CORE_SECTIONS = [/DAG/, /Flow Commands/, /Human Gates/, /State/, /Task Escalation/, /Launch Template/];

test('using-ai-flow holds the coordinator sections', () => {
  const hs = [...read(USING).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(CORE_SECTIONS.filter((re) => !hs.some((h) => re.test(h))).map(String), []);
});

test('Rework Protocol lives in coordinating-apply (REQ-012 A1)', () => {
  const hs = [...read(APPLY_DETAIL).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);
  assert.ok(hs.some((h) => /Rework/.test(h)));
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

test('apply launch carries subagent_type ai-flow:implementer and task-based model and effort', () => {
  const s = applySection(read(APPLY_DETAIL));
  assert.match(s, /subagent_type[^\n]*ai-flow:implementer/);
  assert.match(s, /model and effort[^\n]*difficulty/i);
  assert.match(s, /omitting `?model`? inherits the session model/i);
  assert.match(s, /raise effort[^\n]*(blocked|evidence miss)/i);
  assert.doesNotMatch(s, PINNED_MODEL_RE);
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
  assert.deepEqual(applyPackProblems(read(APPLY_DETAIL)), []);
});

test('negative: a pack that runs tests "at the end" is flagged', () => {
  const bad = read(APPLY_DETAIL).replace(/(## Coordinating apply\n)/, '$1\nRun `npm test` at the end.\n');
  assert.ok(applyPackProblems(bad).includes('batch-style wording /at the end/i'));
});

test('apply is per-task: no batch-launch wording remains in using-ai-flow or coordinating-apply (Task 0.5 leftovers)', () => {
  for (const t of [read(USING), read(APPLY_DETAIL)]) {
    assert.doesNotMatch(t, /launch implementer agents in batches/i);
    assert.doesNotMatch(t, /TDD implementation in batches/i);
    assert.doesNotMatch(t, /execute the remaining batches/i);
  }
});

test('apply records evidence under a per-task key, not the shared apply-progress key', () => {
  const s = applySection(read(APPLY_DETAIL));
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
    if (!/ai-flow:coordinating-apply/.test(body)) p.push('does not name ai-flow:coordinating-apply');
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
  for (const re of [/over 8/, /using-ai-flow/, /ai-flow:coordinating-apply/, /Coordinating apply/, /orchestrator MUST/, /OpenSpace/, /Read and follow/]) assert.ok(p.some((x) => re.test(x)), String(re));
});

test('negative: a skill that copies four implementer lines is flagged', () => {
  const agent = ['Read plan, spec and design from engram first', 'Execute each task test-first following the guide', 'Track progress in engram under the apply key', 'Return the evidence block with the envelope'].join('\n');
  const bad = `---\nname: x\n---\nai-flow:using-ai-flow ai-flow:coordinating-apply Coordinating apply\n${agent.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n')}\n`;
  assert.ok(thinSkillProblems(bad, agent).some((x) => /shares 4 lines/.test(x)));
});

// Task 2.1: routing guidance, escalation rule and launch template (REQ-003 S1/S2, REQ-002 S1).
// 4.0.0: no pinned models. The coordinator picks model and effort per task; omitting model inherits the session model.
const PHASES = ['init', 'explore', 'propose', 'spec', 'design', 'plan', 'apply', 'verify', 'archive', 'debug'];

/** Text of the section with the given heading, up to the next heading of the same or higher level. */
export function sectionOf(text, title) {
  const m = text.match(new RegExp(`^(#{1,6})\\s+${title}\\s*$`, 'm'));
  if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(new RegExp(`^#{1,${m[1].length}}\\s`, 'm'));
  return next === -1 ? rest : rest.slice(0, next);
}

/** Problems with the Routing table: a row per phase saying when to go higher, and no pinned model. */
export function routingTableProblems(text) {
  const s = sectionOf(text, 'Routing');
  if (!s) return ['no Routing section'];
  const rows = s.split('\n').filter((l) => l.trim().startsWith('|'));
  const p = [];
  for (const ph of PHASES) {
    const row = rows.find((l) => new RegExp(`^\\|\\s*${ph}\\b`, 'i').test(l));
    if (!row) { p.push(`no routing row for ${ph}`); continue; }
    if (PINNED_MODEL_RE.test(row)) p.push(`row ${ph} pins a model`);
  }
  return p;
}

test('Routing table has a row per phase agent and pins no model (REQ-003 S1)', () => {
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
  if (!/model and effort[^\n]*difficulty/i.test(s)) p.push('model and effort are not chosen by task difficulty');
  if (!/omitting `?model`? inherits the session model/i.test(s)) p.push('no "omitting model inherits the session model"');
  if (!/raise effort[^\n]*(blocked|evidence)/i.test(s)) p.push('no "raise effort after a blocked return or a missed evidence check"');
  if (PINNED_MODEL_RE.test(s)) p.push('Routing names a pinned model');
  if (!/user[^\n]*(instruction|override)[^\n]*(overrid|wins|takes)|overrid[^\n]*user|user instruction/i.test(s)) p.push('no user-instruction override');
  return p;
}

test('escalation rule: task-based choice, inherit by default, raise effort after blocked or evidence miss, user overrides (REQ-003 S2)', () => {
  assert.deepEqual(escalationProblems(read(USING)), []);
});

test('negative: a Routing section with a pinned default model and no inherit rule is flagged', () => {
  const bad = read(USING).replace(/Omitting `model` inherits the session model[^.]*\./, 'Default to sonnet/medium.');
  const p = escalationProblems(bad);
  assert.ok(p.some((x) => /inherits/.test(x)) && p.some((x) => /pinned model/.test(x)));
  assert.ok(routingTableProblems(read(USING).replace(/^\| init \|/m, '| init | haiku/low |')).some((x) => /init pins a model/.test(x)));
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

/** A specific model named as a default or rule: a model family name or a Claude model id. */
export const PINNED_MODEL_RE = /\b(haiku|sonnet|opus|fable)\b|\bclaude-[a-z]+-\d/i;
const RUNTIME_DIRS = ['agents', 'skills', 'commands', 'hooks'];

/** Runtime files (agents, skills, commands, hooks) whose text names a specific model, as `file:line`. */
export function pinnedModelMentions(root = PLUGIN_ROOT) {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (PINNED_MODEL_RE.test(l)) hits.push(`${path.relative(root, f)}:${i + 1}`); });
    }
  };
  for (const d of RUNTIME_DIRS) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
  return hits;
}

test('no runtime file names a pinned default model (4.0.0: the coordinator picks per task)', () => {
  assert.deepEqual(pinnedModelMentions(), []);
});

test('negative: a runtime copy that pins sonnet for apply is flagged', () => {
  assert.ok(PINNED_MODEL_RE.test('Launch with `model` sonnet, `effort` medium.'));
  assert.ok(PINNED_MODEL_RE.test('model: claude-opus-4-1'));
  assert.ok(!PINNED_MODEL_RE.test('Omitting `model` inherits the session model.'));
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

/** Problems with the question round, the blocked pointer and the no-nesting rule in the core (REQ-004 S3, REQ-005 S3). */
export function returnHandlingProblems(text) {
  const s = sectionOf(text, 'Handling returns');
  const p = [];
  if (!/blocking[^\n]*open_questions|open_questions[^\n]*blocking/i.test(s)) p.push('no rule for blocking open_questions');
  if (!/merge[^\n]*one AskUserQuestion round/i.test(s)) p.push('questions are not merged into one AskUserQuestion round');
  if (!/(4|four) (questions )?per call/i.test(s) || !/recommended option first/i.test(s)) p.push('no 4-per-call limit with the recommended option first');
  if (!/relaunch[^\n]*same agent type[^\n]*fresh[^\n]*Answers:/i.test(s)) p.push('no fresh relaunch of the same agent type with an "Answers:" block');
  if (!/non-blocking[^\n]*next gate/i.test(s)) p.push('non-blocking questions are not shown at the next gate');
  if (!/unattended[^\n]*recommended[^\n]*ASSUMED ANSWER:/i.test(s)) p.push('no ASSUMED ANSWER line under the unattended policy');
  if (!/blocked[^\n]*load ai-flow:coordinating-apply[^\n]*blocked routing/i.test(s)) p.push('blocked does not point to the blocked routing in ai-flow:coordinating-apply');
  if (!/no (sub-?agent|agent)[^\n]*launch[^\n]*(another )?phase agent|(sub-?agents?|agents?) (do not|never|must not) launch[^\n]*agent/i.test(text)) p.push('no rule that a subagent never launches another phase agent');
  return p;
}

/** Problems with the blocked -> debugger routing in coordinating-apply (REQ-005 S3). */
export function blockedRoutingProblems(text) {
  const s = sectionOf(text, 'Blocked routing');
  if (!s) return ['no Blocked routing section'];
  const p = [];
  if (!/blocked[^\n]*ai-flow:debugger[^\n]*high effort/i.test(s) || !/task id/i.test(s) || !/evidence/i.test(s) || !/apply-progress/i.test(s)) p.push('blocked does not launch ai-flow:debugger at high effort with task id, evidence and apply-progress key');
  if (!/debugger[^\n]*ok[^\n]*fresh implementer[^\n]*one routing step up/i.test(s)) p.push('no fresh implementer one routing step up after debugger ok');
  if (!/debugger[^\n]*blocked[^\n]*question to the user/i.test(s)) p.push('debugger blocked does not go to the user as a question');
  return p;
}

test('Handling returns: question round, blocked pointer, no nested launches (REQ-004 S3, REQ-005 S3)', () => {
  assert.deepEqual(returnHandlingProblems(read(USING)), []);
});

test('coordinating-apply holds the blocked -> debugger routing (REQ-005 S3)', () => {
  assert.deepEqual(blockedRoutingProblems(read(APPLY_DETAIL)), []);
});

test('negative: Handling returns without the question round or the blocked pointer is flagged', () => {
  const bad = read(USING).replace(/### Handling returns[\s\S]*?(?=### DAG State Updates)/, '### Handling returns\n\nneeds_input and blocked: decide.\n\n');
  assert.ok(returnHandlingProblems(bad).length >= 7);
});

test('negative: a blocked routing section without the debugger launch is flagged', () => {
  assert.equal(blockedRoutingProblems('## Blocked routing\n\nAsk the user.\n').length, 3);
});

// Task 2.5: commands load the coordinator first (REQ-006 S1, REQ-021 S1, REQ-004 S1, design D-2).
const COMMANDS = ['flow-new', 'flow-ff', 'flow-continue'];

/** Problems with a meta-command body: it must hand control to the coordinator before anything else. */
export function commandProblems(text) {
  const { body } = parseFrontmatter(text);
  const lines = body.split('\n').filter((l) => l.trim());
  const first = lines.find((l) => !l.startsWith('#')) ?? '';
  const p = [];
  if (!/ai-flow:using-ai-flow/.test(first) || !/already loaded/i.test(first)) p.push('first instruction does not load ai-flow:using-ai-flow (unless already loaded)');
  if (!/main thread/i.test(first)) p.push('first instruction does not say to coordinate on the main thread');
  if (/launch[^\n]*orchestrator/i.test(body)) p.push('launches the orchestrator');
  const asks = lines.filter((l) => /AskUserQuestion/.test(l) && !/you \(the main thread\) ask/i.test(l));
  if (asks.length) p.push(`AskUserQuestion outside coordinator-facing wording: ${asks.length} line(s)`);
  return p;
}

for (const c of COMMANDS) {
  test(`command loads the coordinator first: ${c} (REQ-006 S1, REQ-021 S1, REQ-004 S1)`, () => {
    assert.deepEqual(commandProblems(read(`commands/${c}.md`)), []);
  });
}

test('negative: a command that launches the orchestrator, skips the coordinator or tells subagents to ask is flagged', () => {
  const bad = '---\ndescription: d\n---\n# X\n\nLaunch the orchestrator agent.\nThe explorer will use `AskUserQuestion` to ask.\n';
  const p = commandProblems(bad);
  for (const re of [/does not load/, /main thread/, /launches the orchestrator/, /AskUserQuestion outside/]) assert.ok(p.some((x) => re.test(x)), String(re));
  assert.deepEqual(commandProblems('---\ndescription: d\n---\n# X\n\nLoad ai-flow:using-ai-flow (skip if already loaded) and coordinate on the main thread.\nWhen blocking, you (the main thread) ask through AskUserQuestion.\n'), []);
});

// Task 2.16: phase detail loads on demand from sibling skills (REQ-012 amendment A1, resolved decision R16).

/** Problems with a coordinator detail skill: its name, model-invocable, and a SUBAGENT-STOP block (R16). */
export function detailSkillProblems(text, name) {
  const { data, body } = parseFrontmatter(text);
  const p = [];
  if (data.name !== name) p.push(`name is not ${name}`);
  if (String(data['disable-model-invocation']) === 'true') p.push('disable-model-invocation: true blocks the coordinator Skill call');
  if (!/<SUBAGENT-STOP>[\s\S]+<\/SUBAGENT-STOP>/.test(body)) p.push('no SUBAGENT-STOP block');
  return p;
}

test('core points to ai-flow:coordinating-apply, which resolves to a model-invocable skill (REQ-012 A1, Connected Pair 14)', () => {
  const s = sectionOf(read(USING), 'Phase detail');
  assert.ok(s, 'no Phase detail section in the core');
  assert.match(s, /ai-flow:coordinating-apply/);
  assert.equal(resolveQualifiedRef('coordinating-apply'), 'skill');
  assert.deepEqual(detailSkillProblems(read(APPLY_DETAIL), 'coordinating-apply'), []);
});

test('negative: a coordinating-apply copy with disable-model-invocation: true is flagged', () => {
  const bad = read(APPLY_DETAIL).replace(/^---\n/, '---\ndisable-model-invocation: true\n');
  assert.ok(detailSkillProblems(bad, 'coordinating-apply').some((x) => /disable-model-invocation/.test(x)));
});

// Task 2.16, sub-step B: core budget, no phase detail in the core, pointers, detail homes (REQ-012 A1).
const CORE_CHAR_CAP = 10000;
const DETAIL_CHAR_CAP = 8000;

/** Problems with the size of a skill: whole file, text.length (REQ-012 A1). */
export function coreBudgetProblems(text, cap = CORE_CHAR_CAP) {
  return text.length > cap ? [`${text.length} chars, over the cap of ${cap}`] : [];
}

const LEAK_HEADINGS = [/Coordinating apply/, /Rework Protocol/, /Command procedures/, /Artifact Tracking/, /Ecosystem Enhancement/];
const LEAK_MARKERS = ['Task pack', 're-establish RED', 'apply-evidence-{task_id}', 'git worktree add', 'launch ai-flow:debugger'];

/** Phase detail that must stay out of the core: its headings and marker strings. */
export function coreLeakProblems(text) {
  const hs = [...text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);
  return [
    ...LEAK_HEADINGS.filter((re) => hs.some((h) => re.test(h))).map((re) => `heading ${re}`),
    ...LEAK_MARKERS.filter((m) => text.includes(m)).map((m) => `marker "${m}"`),
  ];
}

/** Problems with the Phase detail pointers: both skills named with their triggers, load once. */
export function pointerProblems(text) {
  const s = sectionOf(text, 'Phase detail');
  if (!s) return ['no Phase detail section'];
  const lines = s.split('\n');
  const apply = lines.find((l) => l.includes('ai-flow:coordinating-apply')) ?? '';
  const commands = lines.find((l) => l.includes('ai-flow:coordinating-commands')) ?? '';
  const p = [];
  if (!apply) p.push('does not name ai-flow:coordinating-apply');
  else for (const re of [/implementer/, /debugger/, /rework/i, /apply/]) if (!re.test(apply)) p.push(`apply pointer lacks trigger ${re}`);
  if (!commands) p.push('does not name ai-flow:coordinating-commands');
  else for (const re of [/flow-new/, /flow-ff/, /flow-continue/, /recover/i]) if (!re.test(commands)) p.push(`commands pointer lacks trigger ${re}`);
  if (!/once per conversation/i.test(s)) p.push('does not say to load each once');
  return p;
}

const headingsOf = (text) => [...text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);

describe('core budget and phase detail (REQ-012 A1)', () => {
  test('the core is at most 10,000 chars', () => {
    assert.deepEqual(coreBudgetProblems(read(USING)), []);
  });

  test('each detail skill is at most 8,000 chars', () => {
    for (const f of [APPLY_DETAIL, COMMANDS_DETAIL]) assert.deepEqual(coreBudgetProblems(read(f), DETAIL_CHAR_CAP), [], f);
  });

  test('no phase detail in the core', () => {
    assert.deepEqual(coreLeakProblems(read(USING)), []);
  });

  test('the Phase detail section names both detail skills with their triggers', () => {
    assert.deepEqual(pointerProblems(read(USING)), []);
  });

  test('detail homes: coordinating-apply and coordinating-commands hold the moved sections', () => {
    const a = headingsOf(read(APPLY_DETAIL));
    for (const re of [/Coordinating apply/, /Rework Protocol/, /Ecosystem Enhancement/, /Blocked routing/]) assert.ok(a.some((h) => re.test(h)), `apply detail lacks ${re}`);
    const c = headingsOf(read(COMMANDS_DETAIL));
    for (const re of [/Command procedures/, /Artifact Tracking/]) assert.ok(c.some((h) => re.test(h)), `commands detail lacks ${re}`);
    assert.deepEqual(detailSkillProblems(read(COMMANDS_DETAIL), 'coordinating-commands'), []);
  });

  test('negative (n1): gluing the apply detail back into the core breaks the cap', () => {
    assert.ok(coreBudgetProblems(read(USING) + read(APPLY_DETAIL)).length > 0);
  });

  test('negative (n2): a core with a Coordinating apply heading and a Task pack is flagged exactly twice', () => {
    const bad = `${read(USING)}\n### Coordinating apply\nTask pack...\n`;
    assert.deepEqual(coreLeakProblems(bad), ['heading /Coordinating apply/', 'marker "Task pack"']);
  });

  test('negative (n3): a core without the coordinating-apply pointer line fails the pointer check', () => {
    const text = read(USING);
    const at = text.indexOf('### Phase detail');
    const bad = text.slice(0, at) + text.slice(at).split('\n').filter((l) => !l.includes('ai-flow:coordinating-apply')).join('\n');
    assert.ok(pointerProblems(bad).some((x) => /coordinating-apply/.test(x)));
  });
});
