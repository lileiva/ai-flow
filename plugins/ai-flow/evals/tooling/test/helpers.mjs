// Shared test helpers: temp dirs that are removed when the test file finishes.
import { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const created = [];
after(() => { for (const d of created) fs.rmSync(d, { recursive: true, force: true }); });

export function tmpDir(prefix = 'aiflow-test-') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(d);
  return d;
}

// B2b nested bundles (Task 1.3): copy a fixture bundle to a temp dir and apply variants used by the capture tests.
const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const writeJsonl = (f, lines) => fs.writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
const shortName = (t) => String(t ?? '').split(':').at(-1);
const toolStep = (id, name, input, result) => [
  { type: 'assistant', parent_tool_use_id: null, isSidechain: true, message: { id: `mut-${id}`, role: 'assistant', content: [{ type: 'tool_use', id, name, input }], usage: { input_tokens: 1, output_tokens: 1 } } },
  { type: 'user', parent_tool_use_id: null, isSidechain: true, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: result }] } },
];

/**
 * Copy bundle dir `src` to a fresh temp dir and mutate it. Options (agents are named by short type, e.g. 'planner'):
 *  drop: name | [names]       remove those transcripts (transcript + meta)
 *  corrupt: name | 'all'      replace the transcript(s) with unparseable text
 *  orphan: true               add an explorer transcript whose meta.toolUseId matches no launch
 *  selfDelegate: true         the orchestrator launches ai-flow:orchestrator (depth 2, text only)
 *  implFirst: true            the implementer writes src/ before the test file
 *  readonlyWrite: true        the specifier writes docs/spec.md
 *  ask: true                  the planner calls AskUserQuestion
 *  noMockCalls: true          remove mock-calls.jsonl
 * Returns the new bundle dir.
 */
export function mutateBundle(src, opts = {}) {
  const dir = path.join(tmpDir('aiflow-bundle-'), path.basename(src));
  fs.cpSync(src, dir, { recursive: true });
  const sub = path.join(dir, 'subagents');
  const agents = () => fs.readdirSync(sub).filter((f) => f.endsWith('.meta.json')).map((f) => {
    const id = f.slice('agent-'.length, -'.meta.json'.length);
    return { id, meta: JSON.parse(fs.readFileSync(path.join(sub, f), 'utf8')), file: path.join(sub, `agent-${id}.jsonl`) };
  });
  const byName = (name) => agents().filter((a) => shortName(a.meta.agentType) === name);
  const edit = (name, fn) => { for (const a of byName(name)) writeJsonl(a.file, fn(readJsonl(a.file))); };
  const beforeLast = (extra) => (lines) => [...lines.slice(0, -1), ...extra, lines.at(-1)];
  const addAgent = (id, meta, lines) => {
    fs.writeFileSync(path.join(sub, `agent-${id}.meta.json`), JSON.stringify(meta));
    writeJsonl(path.join(sub, `agent-${id}.jsonl`), lines);
  };
  const userLine = { type: 'user', parent_tool_use_id: null, isSidechain: true, message: { role: 'user', content: 'go' } };
  for (const name of [opts.drop ?? []].flat()) for (const a of byName(name)) { fs.rmSync(a.file); fs.rmSync(path.join(sub, `agent-${a.id}.meta.json`)); }
  if (opts.corrupt) for (const a of opts.corrupt === 'all' ? agents() : byName(opts.corrupt)) fs.writeFileSync(a.file, '{not json\n{"also": broken\n');
  if (opts.orphan) addAgent('aorphan', { agentType: 'ai-flow:explorer', description: 'orphan', toolUseId: 'toolu_ORPHAN', parentAgentId: 'aorch', spawnDepth: 2, finished: true }, [userLine, ...toolStep('toolu_ORPH_R1', 'Read', { file_path: '/w/README.md' }, 'readme')]);
  if (opts.selfDelegate) {
    edit('orchestrator', beforeLast(toolStep('toolu_ORCH2', 'Agent', { subagent_type: 'ai-flow:orchestrator', description: 'again', prompt: 'go' }, 'done')));
    addAgent('aorch2', { agentType: 'ai-flow:orchestrator', description: 'again', toolUseId: 'toolu_ORCH2', parentAgentId: 'aorch', spawnDepth: 2, finished: true }, [userLine, { type: 'assistant', parent_tool_use_id: null, isSidechain: true, message: { id: 'aorch2-m1', role: 'assistant', content: [{ type: 'text', text: 'nothing to do' }], usage: { input_tokens: 1, output_tokens: 1 } } }]);
  }
  if (opts.implFirst) {
    edit('implementer', (lines) => {
      const isImpl = (l) => JSON.stringify(l).includes('toolu_IW2');
      const impl = lines.filter(isImpl);
      const rest = lines.filter((l) => !isImpl(l));
      return [rest[0], ...impl, ...rest.slice(1)];
    });
  }
  if (opts.readonlyWrite) edit('specifier', beforeLast(toolStep('toolu_SPEC_W', 'Write', { file_path: '/w/docs/spec.md', content: 'spec' }, 'ok')));
  if (opts.ask) edit('planner', beforeLast(toolStep('toolu_PLAN_ASK', 'AskUserQuestion', { questions: [{ question: 'ok?' }] }, 'yes')));
  if (opts.noMockCalls) fs.rmSync(path.join(dir, 'mock-calls.jsonl'), { force: true });
  return dir;
}
