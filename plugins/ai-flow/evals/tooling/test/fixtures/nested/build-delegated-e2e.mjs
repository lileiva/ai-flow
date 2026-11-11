#!/usr/bin/env node
// Builds the synthetic delegated-e2e nested fixture (B2b Task 1.3, REQ-015): main -> ai-flow:orchestrator (depth 1)
// -> proposer, specifier, designer, planner, implementer, verifier, archivist (depth 2); implementer -> debugger
// (depth 3). Phase agents save their artifacts with engram mem_save (answered by the agent mock, so they are listed in
// mock-calls.jsonl), the implementer works test-first, and the orchestrator prints the four gate markers in order.
// The trace holds what the CLI keeps (E1): the main thread, part of the depth-1 sidechain (E5) and task_* events.
// Usage: node test/fixtures/nested/build-delegated-e2e.mjs [<out-dir>]   (default: ./delegated-e2e next to this file)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CWD = '/w';
const SESSION = 's-e2e';
const USAGE = { input_tokens: 10, output_tokens: 5 };
const RED = ' Test Files  1 failed (1)\n      Tests  1 failed (1)';
const GREEN = ' Test Files  1 passed (1)\n      Tests  1 passed (1)';
const ENGRAM = 'mcp__plugin_engram_engram__mem_save';

/** Agents: id, type, launching tool_use id, parent agent id, depth, body (transcript steps after the prompt). */
const save = (kind, content) => ({ tool: ENGRAM, input: { title: `${kind} for fix`, topic_key: `flow/fix/${kind}`, project: 'textkit', content }, result: 'saved' });
export const AGENTS = [
  { id: 'aprop', type: 'ai-flow:proposer', launch: 'toolu_PROP', parent: 'aorch', depth: 2, steps: [save('proposal', '## Intent\nfix\n## Scope\nslug\n## Risks\nnone\n## Rollback\nrevert\n## Success Criteria\ntests pass'), { text: 'proposal saved' }] },
  { id: 'aspec', type: 'ai-flow:specifier', launch: 'toolu_SPEC', parent: 'aorch', depth: 2, steps: [save('spec', '## Requirements\nREQ-001 slug ascii\nGiven an accented title When slugified Then ascii'), { text: 'spec saved' }] },
  { id: 'ades', type: 'ai-flow:designer', launch: 'toolu_DES', parent: 'aorch', depth: 2, steps: [save('design', '## Decisions\nnormalize NFD\n## File Changes\nsrc/slug.js\n## Testing Strategy\nvitest'), { text: 'design saved' }] },
  { id: 'aplan', type: 'ai-flow:planner', launch: 'toolu_PLAN', parent: 'aorch', depth: 2, steps: [save('plan', '## Tasks\n1. fix slug\n## Tracer bullet\ntask 1\n## Batches\nbatch 0'), { text: 'plan saved' }] },
  { id: 'aimpl', type: 'ai-flow:implementer', launch: 'toolu_IMPL', parent: 'aorch', depth: 2, steps: [
    { tool: 'Write', id: 'toolu_IW1', input: { file_path: `${CWD}/test/slug.test.js`, content: 'test' }, result: 'ok' },
    { tool: 'Bash', id: 'toolu_IB1', input: { command: 'npx vitest run' }, result: RED },
    { tool: 'Write', id: 'toolu_IW2', input: { file_path: `${CWD}/src/slug.js`, content: 'impl' }, result: 'ok' },
    { tool: 'Agent', id: 'toolu_DBG', input: { subagent_type: 'ai-flow:debugger', description: 'check', prompt: 'investigate' }, result: 'no issue found' },
    { tool: 'Bash', id: 'toolu_IB2', input: { command: 'npx vitest run' }, result: GREEN },
    { text: 'implemented' },
  ] },
  { id: 'adbg', type: 'ai-flow:debugger', launch: 'toolu_DBG', parent: 'aimpl', depth: 3, steps: [
    { tool: 'Read', id: 'toolu_DR1', input: { file_path: `${CWD}/src/slug.js` }, result: 'impl' },
    { text: 'no issue found' },
  ] },
  { id: 'aver', type: 'ai-flow:verifier', launch: 'toolu_VER', parent: 'aorch', depth: 2, steps: [{ tool: 'Bash', id: 'toolu_VB1', input: { command: 'npx vitest run' }, result: GREEN }, { text: 'PASS' }] },
  { id: 'aarch', type: 'ai-flow:archivist', launch: 'toolu_ARCH', parent: 'aorch', depth: 2, steps: [save('archive-report', '## Archive\ndone'), { text: 'archived' }] },
];

const PHASES = AGENTS.filter((a) => a.parent === 'aorch');
const GATE_AFTER = { aprop: 'proposal', aplan: 'plan', aimpl: 'tracer', aver: 'verify' };
const ORCH = { id: 'aorch', type: 'ai-flow:orchestrator', launch: 'toolu_ORCH', depth: 1, steps: PHASES.flatMap((a) => [
  { tool: 'Agent', id: a.launch, input: { subagent_type: a.type, description: a.type.split(':')[1], prompt: 'go' }, result: `${a.type.split(':')[1]} done` },
  ...(GATE_AFTER[a.id] ? [{ text: `AUTO-APPROVED GATE: ${GATE_AFTER[a.id]}` }] : []),
]).concat([{ text: 'flow complete' }]) };

/** Transcript lines of one agent (E4 shape after retention + trim: no parent_tool_use_id, isSidechain true). */
export function transcript(agent) {
  const lines = [{ type: 'user', parent_tool_use_id: null, isSidechain: true, message: { role: 'user', content: 'go' } }];
  agent.steps.forEach((s, i) => {
    const mid = `${agent.id}-m${i + 1}`;
    if (s.text) {
      lines.push({ type: 'assistant', parent_tool_use_id: null, isSidechain: true, message: { id: mid, role: 'assistant', content: [{ type: 'text', text: s.text }], usage: USAGE } });
      return;
    }
    const id = s.id ?? `toolu_${agent.id.toUpperCase()}_${i + 1}`;
    lines.push({ type: 'assistant', parent_tool_use_id: null, isSidechain: true, message: { id: mid, role: 'assistant', content: [{ type: 'tool_use', id, name: s.tool, input: s.input }], usage: USAGE } });
    lines.push({ type: 'user', parent_tool_use_id: null, isSidechain: true, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: s.result }] } });
  });
  return lines;
}

const meta = (a) => ({ agentType: a.type, description: a.type.split(':')[1], toolUseId: a.launch, ...(a.parent ? { parentAgentId: a.parent } : {}), spawnDepth: a.depth, finished: true });
const jsonl = (lines) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';

function trace() {
  const all = [ORCH, ...AGENTS];
  const orchLines = transcript(ORCH);
  const lines = [
    { type: 'system', subtype: 'init', cwd: CWD, model: 'm', session_id: SESSION },
    { type: 'assistant', parent_tool_use_id: null, message: { id: 'main-m1', role: 'assistant', content: [{ type: 'tool_use', id: ORCH.launch, name: 'Agent', input: { subagent_type: ORCH.type, description: 'run', prompt: 'fix bug' } }], usage: USAGE } },
    ...all.map((a) => ({ type: 'system', subtype: 'task_started', tool_use_id: a.launch, task_id: a.id, spawn_depth: a.depth, subagent_type: a.type, task_type: 'local_agent', ...(a.parent ? { parent_task_id: a.parent } : {}) })),
    // E5: the trace keeps only part of the depth-1 sidechain (here the first launch and its result).
    ...orchLines.slice(1, 3).map((l) => ({ ...l, parent_tool_use_id: ORCH.launch })),
    ...[...AGENTS].reverse().map((a) => ({ type: 'system', subtype: 'task_notification', tool_use_id: a.launch, task_id: a.id, status: 'completed', usage: { total_tokens: 100, tool_uses: a.steps.filter((s) => s.tool).length, duration_ms: 1000 } })),
    { type: 'system', subtype: 'task_notification', tool_use_id: ORCH.launch, task_id: ORCH.id, status: 'completed', usage: { total_tokens: 200, tool_uses: PHASES.length, duration_ms: 9000 } },
    { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: ORCH.launch, content: 'flow complete' }] } },
    { type: 'assistant', parent_tool_use_id: null, message: { id: 'main-m2', role: 'assistant', content: [{ type: 'text', text: 'EVAL-RUN-COMPLETE' }], usage: USAGE } },
    { type: 'result', subtype: 'success', total_cost_usd: 0.1, modelUsage: { m: { inputTokens: 1000, outputTokens: 500 } } },
  ];
  return lines;
}

function mockCalls() {
  const saves = AGENTS.flatMap((a) => a.steps.filter((s) => s.tool === ENGRAM));
  return [{ ready: 'e2e', server: 'plugin_engram_engram' }, ...saves.map((s, seq) => ({ seq, server: 'plugin_engram_engram', tool: 'mem_save', responder: 'agent', input: s.input, verdict: 'ok', output: 'saved' }))];
}

export function buildDelegatedE2e(out) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(out, 'trace.jsonl'), jsonl(trace()));
  fs.writeFileSync(path.join(out, 'mock-calls.jsonl'), jsonl(mockCalls()));
  for (const a of [ORCH, ...AGENTS]) {
    fs.writeFileSync(path.join(out, 'subagents', `agent-${a.id}.jsonl`), jsonl(transcript(a)));
    fs.writeFileSync(path.join(out, 'subagents', `agent-${a.id}.meta.json`), JSON.stringify(meta(a)));
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(buildDelegatedE2e(path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'delegated-e2e'))));
}
