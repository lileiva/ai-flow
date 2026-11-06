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
