// Tools allowlist contract for agents (REQ-001 S1/S3, REQ-002 S1, design D-5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, parseFrontmatter } from '../lib/plugin-files.mjs';

const read = (rel) => fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');
const MEM = ['mem_search', 'mem_get_observation', 'mem_save', 'mem_update', 'mem_suggest_topic_key'];
export const ENGRAM_TOOLS = [
  'ToolSearch',
  ...MEM.flatMap((m) => [`mcp__plugin_engram_engram__${m}`, `mcp__engram__${m}`]),
];
const FORBIDDEN_KEYS = ['model', 'effort', 'permissionMode', 'hooks', 'mcpServers'];

export const toolList = (fm) => String(fm.tools ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Generic contract check for one agent's frontmatter; returns a list of problems. */
export function checkAgentTools(fm, role) {
  const p = [];
  const tools = toolList(fm);
  if (!tools.length || /^(all tools|\*)$/i.test(String(fm.tools).trim())) p.push(`${role}: tools missing or unrestricted`);
  if (tools.some((t) => t.startsWith('mcp__')) && !tools.includes('ToolSearch')) p.push(`${role}: mcp__ entry without ToolSearch`);
  for (const bad of ['Agent', 'Skill', 'AskUserQuestion', 'NotebookEdit']) {
    if (tools.includes(bad)) p.push(`${role}: forbidden tool ${bad}`);
  }
  for (const k of FORBIDDEN_KEYS) if (k in fm) p.push(`${role}: forbidden frontmatter key ${k}`);
  return p;
}

const agentFm = (name) => parseFrontmatter(read(`agents/${name}.md`)).data;

test('implementer declares tools incl. ToolSearch and engram names', () => {
  const tools = toolList(agentFm('implementer'));
  assert.ok(tools.length > 0, 'implementer has no tools');
  for (const t of ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'TodoWrite', ...ENGRAM_TOOLS]) {
    assert.ok(tools.includes(t), `implementer tools missing ${t}`);
  }
});

test('implementer tools satisfy the generic contract (REQ-001 S1/S3, REQ-002 S1)', () => {
  assert.deepEqual(checkAgentTools(agentFm('implementer'), 'implementer'), []);
});

test('negative: a model key in agent frontmatter is reported (REQ-002 S1)', () => {
  const fm = { ...agentFm('implementer'), model: 'haiku' };
  assert.ok(checkAgentTools(fm, 'implementer').some((m) => /model/.test(m)));
});

test('negative: an mcp__ entry without ToolSearch is reported', () => {
  const fm = { tools: 'Read, mcp__engram__mem_save' };
  assert.ok(checkAgentTools(fm, 'x').some((m) => /ToolSearch/.test(m)));
});

test('negative: Agent, Skill and AskUserQuestion are reported', () => {
  for (const bad of ['Agent', 'Skill', 'AskUserQuestion', 'NotebookEdit']) {
    assert.ok(checkAgentTools({ tools: `Read, ${bad}` }, 'x').some((m) => m.includes(bad)), bad);
  }
});

test('negative: unrestricted tools are reported', () => {
  assert.ok(checkAgentTools({}, 'x').length > 0);
  assert.ok(checkAgentTools({ tools: 'All tools' }, 'x').length > 0);
});

test('proposer tools include mcp__plugin_engram_engram__mem_save and ToolSearch (REQ-001 S3)', () => {
  const tools = toolList(agentFm('proposer'));
  assert.ok(tools.includes('mcp__plugin_engram_engram__mem_save'), 'proposer missing mem_save');
  assert.ok(tools.includes('ToolSearch'), 'proposer missing ToolSearch');
});

// ---- Read-only agents allowlists (REQ-001 S2/S3/S4, design D-5) ----
const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'];
const READ_ONLY_ROLES = {
  explorer: { bash: true },
  designer: { bash: true },
  proposer: { bash: false },
  specifier: { bash: false },
  planner: { bash: false },
  archivist: { bash: false },
};
const hasWrite = (tools) => WRITE_TOOLS.some((t) => tools.includes(t));

/** Role-specific problems for a read-only agent; returns a list. */
export function checkReadOnly(fm, role, { bash }) {
  const p = [];
  const tools = toolList(fm);
  for (const w of WRITE_TOOLS) if (tools.includes(w)) p.push(`${role}: write tool ${w}`);
  for (const t of ENGRAM_TOOLS) if (!tools.includes(t)) p.push(`${role}: missing ${t}`);
  if (bash !== tools.includes('Bash')) p.push(`${role}: Bash ${bash ? 'missing' : 'present'}`);
  return p;
}

for (const [role, opts] of Object.entries(READ_ONLY_ROLES)) {
  test(`${role} read-only allowlist (REQ-001 S2/S3, D-5)`, () => {
    assert.deepEqual(checkReadOnly(agentFm(role), role, opts), []);
    assert.deepEqual(checkAgentTools(agentFm(role), role), []);
  });
}

test('negative: a specifier copy plus Edit is reported (REQ-001 S2)', () => {
  const fm = { ...agentFm('specifier'), tools: `${agentFm('specifier').tools}, Edit` };
  assert.ok(checkReadOnly(fm, 'specifier', READ_ONLY_ROLES.specifier).some((m) => /Edit/.test(m)));
});

test('negative: a proposer copy without mem_save is reported (REQ-001 S3)', () => {
  const tools = toolList(agentFm('proposer')).filter((t) => !t.endsWith('mem_save')).join(', ');
  assert.ok(checkReadOnly({ tools }, 'proposer', READ_ONLY_ROLES.proposer).some((m) => /mem_save/.test(m)));
});

test('negative: Bash on a no-Bash role is reported (D-5)', () => {
  const fm = { tools: `${agentFm('planner').tools}, Bash` };
  assert.ok(checkReadOnly(fm, 'planner', READ_ONLY_ROLES.planner).some((m) => /Bash/.test(m)));
});

// ---- Verifier, debugger, initializer (REQ-001 S1/S2, design D-5) ----
const BASE = ['Read', 'Glob', 'Grep'];
const ROLE_TOOLS = {
  verifier: [...BASE, 'Bash', ...ENGRAM_TOOLS],
  debugger: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'TodoWrite', ...ENGRAM_TOOLS],
  initializer: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', ...ENGRAM_TOOLS],
};

for (const [role, expected] of Object.entries(ROLE_TOOLS)) {
  test(`${role} tools equal its role allowlist (REQ-001 S1/S2, D-5)`, () => {
    assert.deepEqual([...toolList(agentFm(role))].sort(), [...expected].sort());
    assert.deepEqual(checkAgentTools(agentFm(role), role), []);
  });
}

test('debugger tools equal the implementer set (D-5)', () => {
  assert.deepEqual([...toolList(agentFm('debugger'))].sort(), [...toolList(agentFm('implementer'))].sort());
});

test('verifier has no write tools (REQ-001 S2)', () => {
  assert.ok(!hasWrite(toolList(agentFm('verifier'))));
});

test('initializer description does not claim read-only (REQ-001 S1)', () => {
  assert.doesNotMatch(String(agentFm('initializer').description), /read-only/i);
});

test('every agent file, including the orchestrator stub, declares tools (REQ-001 S1)', () => {
  const files = fs.readdirSync(path.join(PLUGIN_ROOT, 'agents')).filter((f) => f.endsWith('.md'));
  assert.equal(files.length, 11);
  for (const f of files) {
    const n = f.replace(/\.md$/, '');
    assert.ok(toolList(agentFm(n)).length > 0, `${n} has no tools`);
  }
});

// Explicit sets (not derived from descriptions, which later de-coercion edits may reword).
const EXPECTED_NO_WRITE = ['archivist', 'designer', 'explorer', 'planner', 'proposer', 'specifier', 'verifier'];
const EXPECTED_READ_ONLY = ['archivist', 'designer', 'explorer', 'planner', 'proposer', 'specifier'];

test('frontmatter write-less sets equal eval config readOnlyAgents/noWriteAgents (REQ-001 S4)', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'evals/tooling/config.json'), 'utf8'));
  // orchestrator.md is excluded: the deprecated stub (R2) is never launched, and adding it
  // to the config would change eval grading.
  const names = fs.readdirSync(path.join(PLUGIN_ROOT, 'agents'))
    .map((f) => f.replace(/\.md$/, '')).filter((n) => n !== 'orchestrator');
  const noWrite = names.filter((n) => !hasWrite(toolList(agentFm(n)))).sort();
  assert.deepEqual(noWrite, EXPECTED_NO_WRITE);
  assert.deepEqual([...cfg.noWriteAgents].sort(), noWrite);
  assert.deepEqual([...cfg.readOnlyAgents].sort(), EXPECTED_READ_ONLY);
});
