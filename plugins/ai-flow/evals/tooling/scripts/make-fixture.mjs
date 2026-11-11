#!/usr/bin/env node
// Derive small, targeted analyzer fixtures from the real tracer trace (task 2.7). Each fixture keeps the
// init line, the main-thread Agent call that launched the implementer, the implementer's sidechain and the
// final result line, then applies one recipe to the sidechain.
// Usage: node scripts/make-fixture.mjs <recipe> <real-case-a.jsonl> <out.jsonl>    (recipes: see RECIPES)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const GREEN_OUTPUT = ' Test Files  1 passed (1)\n      Tests  4 passed (4)';
export const ENV_ERROR_OUTPUT = "node:internal/modules/cjs/loader:1228\n  throw err;\nError: Cannot find module '/HOME/.nvm/versions/node/v26.5.0/lib/node_modules/npm/bin/npm-cli.js'";

const uses = (line) => (line.type === 'assistant' ? (line.message?.content ?? []).filter((c) => c.type === 'tool_use') : []);
const resultFor = (line, id) => line.type === 'user' && (line.message?.content ?? []).some((c) => c.type === 'tool_result' && c.tool_use_id === id);
const clone = (x) => JSON.parse(JSON.stringify(x));

/** { header, side, tail } for the first sidechain launched with subagent_type `type`. */
export function extractAgent(lines, type = 'ai-flow:implementer') {
  let launchLine = null;
  let id = null;
  for (const l of lines) {
    const u = uses(l).find((c) => (c.name === 'Agent' || c.name === 'Task') && c.input?.subagent_type === type);
    if (u) { launchLine = l; id = u.id; break; }
  }
  if (!id) throw new Error(`no ${type} launch in trace`);
  const launch = clone(launchLine);
  launch.message.content = launch.message.content.filter((c) => c.id === id);
  const header = [lines.find((l) => l.type === 'system' && l.subtype === 'init'), launch];
  const side = lines.filter((l) => l.parent_tool_use_id === id).map(clone);
  const tail = [lines.filter((l) => l.type === 'result').at(-1)];
  return { header, side, tail, id };
}

function findUse(side, pred) {
  const i = side.findIndex((l) => uses(l).some(pred));
  if (i < 0) throw new Error('tool_use not found');
  const id = uses(side[i]).find(pred).id;
  const j = side.findIndex((l) => resultFor(l, id));
  return { i, j, id };
}

const isTestEdit = (c) => (c.name === 'Edit' || c.name === 'Write') && /\/test\/slugify\.test\.js$/.test(c.input?.file_path ?? '');
const isImplWrite = (c) => (c.name === 'Edit' || c.name === 'Write') && /\/src\/slugify\.js$/.test(c.input?.file_path ?? '');
const isRedRun = (side) => (c) => c.name === 'Bash' && side.some((l) => resultFor(l, c.id) && /\d+ failed/.test(JSON.stringify(l.message.content)));

function setResult(side, id, text) {
  for (const l of side) for (const c of l.message?.content ?? []) if (c.type === 'tool_result' && c.tool_use_id === id) c.content = text;
}

function replaceRed(side, text) {
  const { id } = findUse(side, isRedRun(side));
  setResult(side, id, text);
  return side;
}

export const RECIPES = {
  'tdd-test-first': (side) => side,
  'tdd-impl-first': (side) => {
    replaceRed(side, GREEN_OUTPUT);
    const impl = findUse(side, isImplWrite);
    const moved = [side[impl.i], side[impl.j]];
    const rest = side.filter((_, k) => k !== impl.i && k !== impl.j);
    const t = findUse(rest, isTestEdit);
    return [...rest.slice(0, t.i), ...moved, ...rest.slice(t.i)];
  },
  'tdd-no-red': (side) => replaceRed(side, GREEN_OUTPUT),
  'tdd-partial': (side) => {
    const impl = findUse(side, isImplWrite);
    const use = clone(side[impl.i]);
    const res = clone(side[impl.j]);
    const id = 'toolu_fixture_truncate';
    use.message.id = 'msg_fixture_truncate';
    use.message.content = [{ type: 'tool_use', id, name: 'Edit', input: { file_path: uses(side[impl.i])[0].input.file_path.replace(/slugify\.js$/, 'truncate.js'), old_string: 'max', new_string: 'limit' } }];
    res.message.content = [{ type: 'tool_result', tool_use_id: id, content: 'The file src/truncate.js has been updated successfully.' }];
    return [...side.slice(0, impl.j + 1), use, res, ...side.slice(impl.j + 1)];
  },
  'npm-env-error': (side) => replaceRed(side, ENV_ERROR_OUTPUT),
};

/** Main-thread skeleton: init, main-thread assistant/user lines (no sidechains) and the last result. */
export function extractMain(lines) {
  const init = lines.find((l) => l.type === 'system' && l.subtype === 'init');
  const main = lines.filter((l) => (l.type === 'assistant' || l.type === 'user') && !l.parent_tool_use_id).map(clone);
  return { header: [init], main, tail: [lines.filter((l) => l.type === 'result').at(-1)] };
}

const launchOf = (agent) => (c) => c.name === 'Agent' && c.input?.subagent_type === `ai-flow:${agent}`;
const launchIdx = (main, agent) => main.findIndex((l) => uses(l).some(launchOf(agent)));
const move = (arr, from, to) => { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };
const dropLaunches = (main, keep) => main.filter((l) => !uses(l).some((c) => c.name === 'Agent' && !keep.includes(String(c.input?.subagent_type).split(':')[1])));

/** Recipes over the main-thread skeleton (phase/gate grader fixtures, task 2.10). */
export const PHASE_RECIPES = {
  'phase-ok': (main) => main,
  'phase-out-of-order': (main) => move(main, launchIdx(main, 'implementer'), launchIdx(main, 'planner')),
  'phase-design-first': (main) => move(main, launchIdx(main, 'designer'), launchIdx(main, 'specifier')),
  'gate-skipped': (main) => main.filter((l) => !(l.type === 'assistant' && (l.message.content ?? []).some((c) => c.type === 'text' && c.text.startsWith('AUTO-APPROVED GATE: plan')))),
  'main-thread-writes': (main, cwd) => {
    const i = launchIdx(main, 'implementer');
    const id = uses(main[i]).find(launchOf('implementer')).id;
    const out = [...main];
    out[i] = clone(main[i]);
    out[i].message.content = [{ type: 'tool_use', id, name: 'Write', input: { file_path: `${cwd}/src/slugify.js`, content: 'export function slugify() {}' } }];
    return out;
  },
  'd-apply-only-ok': (main) => dropLaunches(main, ['implementer']),
  'd-apply-only-violated': (main) => dropLaunches(main, ['planner', 'implementer']),
};

const useLine = (parent, id, name, input) => ({ type: 'assistant', parent_tool_use_id: parent, message: { id: `msg_${id}`, role: 'assistant', content: [{ type: 'tool_use', id, name, input }], usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
const resLine = (parent, id, content, isError = false) => ({ type: 'user', parent_tool_use_id: parent, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) }] } });

/** Recipes that append tool calls to one agent's sidechain (tool-use grader fixtures, task 2.12). */
export const TOOLUSE_RECIPES = {
  'subagent-ask': { agent: 'ai-flow:explorer', add: (p) => [useLine(p, 'toolu_fx_ask', 'AskUserQuestion', { questions: [{ question: 'Which approach?' }] }), resLine(p, 'toolu_fx_ask', '<tool_use_error>Error: No such tool available: AskUserQuestion</tool_use_error>', true)] },
  'readonly-write': { agent: 'ai-flow:specifier', add: (p, cwd) => [useLine(p, 'toolu_fx_write', 'Write', { file_path: `${cwd}/docs/spec.md`, content: '# Spec' }), resLine(p, 'toolu_fx_write', 'File created successfully')] },
  'verifier-edit': { agent: 'ai-flow:verifier', add: (p, cwd) => [useLine(p, 'toolu_fx_edit', 'Edit', { file_path: `${cwd}/src/slugify.js`, old_string: 'a', new_string: 'b' }), resLine(p, 'toolu_fx_edit', 'The file has been updated successfully.')] },
  'nested-sidechain': {
    agent: 'ai-flow:implementer',
    add: (p) => [
      useLine(p, 'toolu_fx_nested', 'Agent', { subagent_type: 'general-purpose', description: 'nested helper' }),
      useLine('toolu_fx_nested', 'toolu_fx_nested_ask', 'AskUserQuestion', { questions: [{ question: 'Proceed?' }] }),
      useLine('toolu_fx_orphan', 'toolu_fx_orphan_ask', 'AskUserQuestion', { questions: [{ question: 'Who am I?' }] }),
    ],
  },
};

/** Recipes over the whole trace text (raw lines). */
export const TRACE_RECIPES = {
  // Every 20th line truncated mid-JSON (5% unparseable; the analyzer's threshold is 1%). The last result line stays intact.
  corrupt: (raw) => raw.map((l, i) => (i % 20 === 7 && !l.startsWith('{"type":"result"') ? l.slice(0, Math.floor(l.length / 2)) : l)),
};

export function makeFixture(realText, recipe) {
  if (TRACE_RECIPES[recipe]) return TRACE_RECIPES[recipe](realText.split('\n').filter((l) => l.trim())).join('\n') + '\n';
  const lines = realText.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (PHASE_RECIPES[recipe]) {
    const { header, main, tail } = extractMain(lines);
    return [...header, ...PHASE_RECIPES[recipe](main, header[0].cwd), ...tail].map((l) => JSON.stringify(l)).join('\n') + '\n';
  }
  if (TOOLUSE_RECIPES[recipe]) {
    const { agent, add } = TOOLUSE_RECIPES[recipe];
    const { header, side, tail, id } = extractAgent(lines, agent);
    return [...header, ...side, ...add(id, header[0].cwd), ...tail].map((l) => JSON.stringify(l)).join('\n') + '\n';
  }
  const { header, side, tail } = extractAgent(lines);
  return [...header, ...RECIPES[recipe](side), ...tail].map((l) => JSON.stringify(l)).join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [recipe, input, output] = process.argv.slice(2);
  if (![RECIPES, TRACE_RECIPES, PHASE_RECIPES, TOOLUSE_RECIPES].some((r) => r[recipe])) { console.error(`unknown recipe ${recipe}; one of ${[RECIPES, PHASE_RECIPES, TOOLUSE_RECIPES, TRACE_RECIPES].flatMap(Object.keys).join(', ')}`); process.exit(2); }
  fs.writeFileSync(output, makeFixture(fs.readFileSync(input, 'utf8'), recipe));
}
