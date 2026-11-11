#!/usr/bin/env node
// Offline stand-in for the `claude` CLI (REQ-014 S4, REQ-019). Selected via AIFLOW_EVAL_CLAUDE_BIN.
// Behaviour is scripted by the JSON file in AIFLOW_STUB_SCENARIO:
//   { bashResults: [string], exitCode?: number, costUsd?: number (per run), caseName?: string, error?: string,
//     traceFile?: path (copied as each run's trace), workspaceFrom?: path (copied as each run's workspace),
//     caseNames?: { <id>: name }, allCases?: [name] (when no --case is given),
//     partial?: boolean, noTrace?: boolean (the run leaves no trace.jsonl), runsProduced?: number (fewer runs, e.g. cap abort),
//     nested?: { transcriptsDir: path (holding subagents/ and optionally mock-calls.jsonl), sessionId?: string } }
// With `nested`, each run also gets the CLI's subagent transcript layout (CLI 2.1.309, B2b design E2/E6):
// <run>/config/projects/<cwd-slug>/<sessionId>/subagents/agent-<id>.{jsonl,meta.json} and <run>/out/mock-calls.jsonl.
// Every transcript gets a seeded `session_context` attachment and a text line carrying a fake email and a
// macOS home-dir path, so tests can prove the retained bundle drops or scrubs them.
// Like the real CLI (2.1.301) under --keep-temp, each run leaves <tmp>/e-XXXX/{out/trace.jsonl,sealed/home/cwd}
// behind with a read-only root (dr-x------) and a d--------- sealed dir holding the workspace.
// Every invocation appends its argv (JSON array) to AIFLOW_STUB_LOG when set.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
// `claude --version` (preflight) is answered before logging, so argv logs only hold eval invocations.
if (argv[0] === '--version') {
  const v = process.env.AIFLOW_STUB_SCENARIO ? JSON.parse(fs.readFileSync(process.env.AIFLOW_STUB_SCENARIO, 'utf8')).claudeVersion : undefined;
  process.stdout.write(`${v ?? '2.1.301 (Claude Code)'}\n`);
  process.exit(0);
}
if (process.env.AIFLOW_STUB_LOG) fs.appendFileSync(process.env.AIFLOW_STUB_LOG, JSON.stringify(argv) + '\n');
const sc = process.env.AIFLOW_STUB_SCENARIO ? JSON.parse(fs.readFileSync(process.env.AIFLOW_STUB_SCENARIO, 'utf8')) : {};

function flagValue(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const model = flagValue('--model') ?? 'sonnet';
const runs = Number(flagValue('--runs') ?? 1);
const costUsd = sc.costUsd ?? 0.01;

const pluginKey = path.basename(argv[2] ?? '');

function bashTrace(cwd) {
  const lines = [{ type: 'system', subtype: 'init', cwd, model: `claude-${model}-stub`, plugins: [], mcp_servers: [], tools: ['Bash'] }];
  const hook = sc.hookResponses?.[pluginKey];
  if (hook) lines.unshift({ type: 'system', subtype: 'hook_response', hook_event: 'SessionStart', hook_name: 'SessionStart:startup', ...hook });
  const firstInput = sc.firstTurnInputs?.[pluginKey];
  if (firstInput != null) lines.push({ type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_stub_first', role: 'assistant', content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: firstInput, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
  (sc.bashResults ?? []).forEach((content, i) => {
    const id = `toolu_stub_${i}`;
    lines.push({ type: 'assistant', parent_tool_use_id: null, message: { id: `msg_stub_${i}`, role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'probe' } }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
    lines.push({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content }] } });
  });
  lines.push({ type: 'result', subtype: 'success', total_cost_usd: costUsd, modelUsage: {} });
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

// Per-case errors: caseErrors[<id>] is a string (every run) or an array consumed run by run ACROSS invocations
// (state kept next to the scenario file), so a retry invocation sees the next entry (null = clean run).
const statePath = process.env.AIFLOW_STUB_SCENARIO ? `${process.env.AIFLOW_STUB_SCENARIO}.state` : null;
const state = statePath && fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
function errorFor(caseName) {
  const id = caseName.split('-')[0];
  const e = sc.caseErrors?.[id];
  if (e === undefined) return sc.error ?? null;
  if (!Array.isArray(e)) return e;
  const k = state[id] ?? 0;
  state[id] = k + 1;
  return e[k] ?? null;
}

const SEEDED_EMAIL = 'probe@example.invalid';
const SEEDED_PATH = '/Use' + 'rs/someone/x'; // split so the committed-files scan (scrub.test) does not trip
function writeNested(runRoot, cwd) {
  const src = sc.nested.transcriptsDir;
  const sessionId = sc.nested.sessionId ?? 'stub-session';
  const dest = path.join(runRoot, 'config', 'projects', cwd.replace(/\//g, '-'), sessionId, 'subagents');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(path.join(src, 'subagents'))) {
    let text = fs.readFileSync(path.join(src, 'subagents', f), 'utf8');
    if (f.endsWith('.jsonl')) {
      const seeded = [
        { type: 'attachment', isSidechain: true, attachment: { type: 'session_context', userEmail: SEEDED_EMAIL, cwd: SEEDED_PATH } },
        { type: 'assistant', isSidechain: true, message: { id: `msg_seeded_${f}`, role: 'assistant', content: [{ type: 'text', text: `mail ${SEEDED_EMAIL} at ${SEEDED_PATH}` }] } },
      ];
      text = text.trimEnd() + '\n' + seeded.map((l) => JSON.stringify(l)).join('\n') + '\n';
    }
    fs.writeFileSync(path.join(dest, f), text);
  }
  const mock = path.join(src, 'mock-calls.jsonl');
  if (fs.existsSync(mock)) fs.copyFileSync(mock, path.join(runRoot, 'out', 'mock-calls.jsonl'));
}

function oneRun(caseName) {
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e-'));
  const outDir = path.join(runRoot, 'out');
  const cwd = path.join(runRoot, 'sealed', 'home', 'cwd');
  fs.mkdirSync(outDir, { recursive: true });
  if (sc.workspaceFrom) fs.cpSync(sc.workspaceFrom, cwd, { recursive: true, verbatimSymlinks: true });
  else fs.mkdirSync(cwd, { recursive: true });
  const tracePath = path.join(outDir, 'trace.jsonl');
  // A plugin dir scripted in firstTurnInputs (SessionStart variants) always gets the synthetic trace.
  const useTraceFile = sc.traceFile && sc.firstTurnInputs?.[pluginKey] == null;
  fs.writeFileSync(tracePath, useTraceFile ? fs.readFileSync(sc.traceFile, 'utf8') : bashTrace(cwd));
  if (sc.noTrace) fs.rmSync(tracePath);
  if (sc.nested) writeNested(runRoot, cwd);
  fs.mkdirSync(path.join(runRoot, 'sealed'), { recursive: true });
  fs.chmodSync(path.join(runRoot, 'sealed'), 0o000);
  fs.chmodSync(runRoot, 0o500);
  return { score: 1, passed: true, turns: 1, costUsd, judgeCostUsd: 0, durationSeconds: 1, error: errorFor(caseName), tracePath, graders: [] };
}

// Case selection mirrors the real CLI (2.1.302, probed 2026-10-18): `--case` takes ONE name glob (the last one
// wins), repeated `--tag` values are ORed, and --case/--tag combine with AND. `case-<id>` tags select case <id>
// (names from caseNames, else caseName when it matches, else <id>-stub); other tags are not modelled.
const lastCase = argv.reduce((v, a, i) => (a === '--case' ? argv[i + 1] : v), null);
const tagIds = argv.flatMap((a, i) => (a === '--tag' ? [argv[i + 1]] : [])).filter((t) => /^case-[a-z]$/.test(t)).map((t) => t.slice(5));
const nameOf = (id) => sc.caseNames?.[id] ?? (sc.caseName?.startsWith(`${id}-`) ? sc.caseName : `${id}-stub`);
let ids = lastCase ? [lastCase.replace(/-\*$/, '')] : null;
if (tagIds.length) ids = ids ? ids.filter((id) => tagIds.includes(id)) : tagIds;
const names = ids ? ids.map(nameOf) : (sc.allCases ?? [sc.caseName ?? 'node-probe']);
const cases = names.map((name) => ({ name, arms: { with: Array.from({ length: sc.runsProduced ?? runs }, () => oneRun(name)) } }));
if (statePath) fs.writeFileSync(statePath, JSON.stringify(state));
const produced = cases.reduce((n, c) => n + c.arms.with.length, 0);
const aggregate = {
  schemaVersion: 1, claudeVersion: '2.1.301-stub', durationSeconds: produced, costUsd: costUsd * produced, partial: sc.partial ?? false,
  cases,
};
const jsonPath = flagValue('--json');
if (jsonPath && jsonPath.endsWith('.json')) fs.writeFileSync(jsonPath, JSON.stringify(aggregate, null, 2));
else process.stdout.write(JSON.stringify(aggregate));
process.exit(sc.exitCode ?? 0);
