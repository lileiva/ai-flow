// Task 0.14 (REQ-019 S2): offline fixtures are trimmed real traces that keep every field the analyzer reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trimTrace } from '../scripts/trim-trace.mjs';
import { analyzeTrace } from '../analyze.mjs';

const TRACES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'traces');
const BIG = 'x'.repeat(5000);

function sample() {
  const lines = [
    { type: 'system', subtype: 'init', cwd: '/home/someone/w', model: 'm', slash_commands: ['a'.repeat(3000)], plugins: [{ name: 'ai-flow', path: `/private/var/${'folders'}/sh/h7_x/T/aiflow-eval-1/plugins/ai-flow` }] },
    { type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_1', content: [{ type: 'thinking', thinking: BIG, signature: BIG }], usage: { input_tokens: 3, output_tokens: 4 } } },
    { type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_1', content: [{ type: 'tool_use', id: 'toolu_A', name: 'Agent', input: { subagent_type: 'ai-flow:implementer', prompt: BIG } }], usage: { input_tokens: 3, output_tokens: 4 } } },
    { type: 'assistant', parent_tool_use_id: 'toolu_A', message: { id: 'msg_2', content: [{ type: 'tool_use', id: 'toolu_W', name: 'Write', input: { file_path: '/home/someone/w/test/a.test.js', content: BIG } }], usage: { input_tokens: 1, output_tokens: 1 } } },
    { type: 'user', parent_tool_use_id: 'toolu_A', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_W', content: BIG }] }, tool_use_result: { stdout: BIG } },
    { type: 'assistant', parent_tool_use_id: 'toolu_A', message: { id: 'msg_3', content: [{ type: 'tool_use', id: 'toolu_B', name: 'Bash', input: { command: 'npm test', description: 'd' } }], usage: { input_tokens: 1, output_tokens: 1 } } },
    { type: 'rate_limit_event', rate_limit_info: { utilization: 0.8 } },
    { type: 'result', subtype: 'success', total_cost_usd: 1.5, modelUsage: { m: { inputTokens: 1 } }, usage: { input_tokens: 1 } },
  ];
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

test('trimTrace keeps type, ids, usage, attribution and tool inputs; truncates results to 2 KB; scrubs $HOME', () => {
  const out = trimTrace(sample(), { home: '/home/someone' });
  const lines = out.trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(!out.includes('/home/someone'));
  assert.ok(!/\/private\/var\/folders/.test(out), 'macOS per-user temp folders are scrubbed');
  assert.equal(lines[0].plugins[0].path, '/tmp/aiflow-eval-1/plugins/ai-flow');
  assert.ok(out.includes('/HOME/w/test/a.test.js'));
  assert.equal(lines.filter((l) => l.type === 'rate_limit_event').length, 0);
  const a = lines.find((l) => l.message?.content?.[0]?.name === 'Agent');
  assert.equal(a.message.id, 'msg_1');
  assert.deepEqual(a.message.usage, { input_tokens: 3, output_tokens: 4 });
  assert.equal(a.message.content[0].input.subagent_type, 'ai-flow:implementer');
  assert.ok(a.message.content[0].input.prompt.length <= 300);
  const w = lines.find((l) => l.message?.content?.[0]?.name === 'Write');
  assert.equal(w.parent_tool_use_id, 'toolu_A');
  assert.equal(w.message.content[0].input.file_path, '/HOME/w/test/a.test.js');
  const r = lines.find((l) => l.type === 'user');
  assert.equal(r.message.content[0].tool_use_id, 'toolu_W');
  assert.equal(r.message.content[0].content.length, 2048);
  assert.equal(r.tool_use_result, undefined);
  const b = lines.find((l) => l.message?.content?.[0]?.name === 'Bash');
  assert.equal(b.message.content[0].input.command, 'npm test');
  const res = lines.find((l) => l.type === 'result');
  assert.equal(res.total_cost_usd, 1.5);
  assert.ok(out.length < sample().length / 3);
});

test('analyze(trimmed) equals analyze(original) on tokens and tdd (re-trimming the real fixture is lossless)', () => {
  const orig = fs.readFileSync(path.join(TRACES, 'real-case-a.jsonl'), 'utf8');
  const a = analyzeTrace(orig);
  const b = analyzeTrace(trimTrace(orig, { home: '/private/tmp' }));
  assert.deepEqual(b.tokens, a.tokens);
  assert.deepEqual(b.tdd, a.tdd);
});

test('the committed real fixture is small and scrubbed', () => {
  const file = path.join(TRACES, 'real-case-a.jsonl');
  assert.ok(fs.statSync(file).size <= 300 * 1024);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!/\/Users\/[a-z]/.test(text), 'no user home paths');
  assert.ok(!/sk-ant|bearer\s|api[_-]?key/i.test(text), 'no credentials');
});

test('engram mem_save/mem_update content is kept up to 16 KB so artifact sections survive trimming (task 2.11)', () => {
  const big = '## Intent\n' + 'y'.repeat(6000) + '\n## Rollback\nrevert';
  const line = { type: 'assistant', parent_tool_use_id: 'toolu_A', message: { id: 'm9', content: [{ type: 'tool_use', id: 'toolu_S', name: 'mcp__plugin_engram_engram__mem_save', input: { title: 't', topic_key: 'flow/x/proposal', content: big } }] } };
  const out = JSON.parse(trimTrace(JSON.stringify(line) + '\n', { home: '/nonexistent' }));
  assert.equal(out.message.content[0].input.content, big);
  const write = { ...line, message: { ...line.message, content: [{ type: 'tool_use', id: 'toolu_W', name: 'Write', input: { file_path: 'a', content: big } }] } };
  assert.equal(JSON.parse(trimTrace(JSON.stringify(write) + '\n', { home: '/nonexistent' })).message.content[0].input.content.length, 2048);
});

// P4.6 finding: run markers at the END of a long text were cut off, losing the plan gate of real case (e).
test('trimming a long text keeps the gate and completion markers that follow the cut', () => {
  const text = `${'y'.repeat(6000)}\nAUTO-APPROVED GATE: proposal\nmore\nSTOPPED AT GATE: plan\nEVAL-RUN-COMPLETE`;
  const line = { type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_m', content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 } } };
  const out = JSON.parse(trimTrace(JSON.stringify(line) + '\n').trim()).message.content[0].text;
  assert.ok(out.length < 3000, `trimmed to ${out.length}`);
  for (const m of ['AUTO-APPROVED GATE: proposal', 'STOPPED AT GATE: plan', 'EVAL-RUN-COMPLETE']) assert.ok(out.includes(m), m);
});

test('B2b: trimTrace keeps transcript agentId/isSidechain and drops attachment and api-request* lines (seeded session_context email)', () => {
  const text = [
    { type: 'user', isSidechain: true, agentId: 'a1', sessionId: 's', uuid: 'u1', message: { role: 'user', content: 'go' } },
    { type: 'attachment', isSidechain: true, agentId: 'a1', attachment: { type: 'session_context', userEmail: 'probe@example.invalid' } },
    { type: 'api-request', agentId: 'a1', body: 'x' },
    { type: 'api-request-shape', agentId: 'a1' },
    { type: 'api-request-blob', agentId: 'a1' },
    { type: 'assistant', isSidechain: true, agentId: 'a1', message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 1, output_tokens: 1 } } },
  ].map((l) => JSON.stringify(l)).join('\n');
  const out = trimTrace(text, { home: '/home/someone' });
  const lines = out.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.type), ['user', 'assistant']);
  assert.ok(lines.every((l) => l.agentId === 'a1' && l.isSidechain === true));
  assert.ok(!out.includes('session_context') && !out.includes('example.invalid'));
});

test('B2b W5: trimTrace keeps every input key of an mcp__ tool call (mock calls are matched by canonical input)', () => {
  const line = { type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', id: 't', name: 'mcp__memx__note', input: { text: 'from-leaf', tags: ['a'], long: 'y'.repeat(5000) } }] } };
  const out = JSON.parse(trimTrace(JSON.stringify(line)).trim());
  const input = out.message.content[0].input;
  assert.equal(input.text, 'from-leaf');
  assert.deepEqual(input.tags, ['a']);
  assert.equal(input.long.length, 2048);
});
