#!/usr/bin/env node
// SessionStart cost (REQ-012 as amended by U3; design D10), measured on temp plugin copies so the ai-flow suite
// stays at 5 cases and the source tree is never modified (the hook exec-bit fix belongs to B2).
// Variants of plugins/ai-flow at --plugin-ref, each holding one 1-turn "Reply OK" probe case:
//   as-shipped  the ref's files and modes unchanged (v3.4.0: run-hook.cmd is 0644, so the hook fails with 126)
//   full        as-shipped with hooks/run-hook.cmd made executable (the intended behaviour)
//   no-hooks    full without hooks/
//   empty       only .claude-plugin/plugin.json
// Usage: node measure-session-start.mjs [--plugin-ref v3.4.0] [--model sonnet] [--out <file>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { spawnClaude } from './lib/claude.mjs';
import { parseTrace } from './lib/trace.mjs';
import { sessionStart } from './lib/env.mjs';
import { addWorktree, removeWorktree } from './lib/git.mjs';
import { removeKeptTemp } from './preflight.mjs';

export const VARIANTS = ['as-shipped', 'full', 'no-hooks', 'empty'];

const PROBE_PROMPT = `---
max_turns: 1
timeout_seconds: 300
---
Reply with exactly: OK
`;
const PROBE_GRADER = `---
type: regex
target: last_message
pattern: OK
---
`;

function addProbe(dir) {
  const caseDir = path.join(dir, 'evals', 'ss-probe');
  fs.mkdirSync(path.join(caseDir, 'graders'), { recursive: true });
  fs.writeFileSync(path.join(caseDir, 'prompt.md'), PROBE_PROMPT);
  fs.writeFileSync(path.join(caseDir, 'graders', 'replied.md'), PROBE_GRADER);
}

/** Build the four variant plugin dirs under root from pluginSrc; returns { <variant>: dir }. */
export function buildVariants(pluginSrc, root) {
  const dirs = Object.fromEntries(VARIANTS.map((v) => [v, path.join(root, v)]));
  const top = (base, src) => path.relative(base, src).split(path.sep)[0];
  fs.cpSync(pluginSrc, dirs['as-shipped'], { recursive: true, filter: (src) => top(pluginSrc, src) !== 'evals' });
  fs.cpSync(dirs['as-shipped'], dirs.full, { recursive: true });
  const hook = path.join(dirs.full, 'hooks', 'run-hook.cmd');
  if (fs.existsSync(hook)) fs.chmodSync(hook, fs.statSync(hook).mode | 0o755);
  fs.cpSync(dirs['as-shipped'], dirs['no-hooks'], { recursive: true, filter: (src) => top(dirs['as-shipped'], src) !== 'hooks' });
  fs.mkdirSync(path.join(dirs.empty, '.claude-plugin'), { recursive: true });
  const name = JSON.parse(fs.readFileSync(path.join(pluginSrc, '.claude-plugin', 'plugin.json'), 'utf8')).name;
  fs.writeFileSync(path.join(dirs.empty, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version: '0.0.0', description: 'empty plugin (SessionStart baseline)' }, null, 2));
  for (const d of Object.values(dirs)) addProbe(d);
  return dirs;
}

/** stdout chars of hooks/session-start run directly (temp HOME, minimal PATH, as inside an eval run). */
export function hookChars(pluginDir) {
  const script = path.join(pluginDir, 'hooks', 'session-start');
  if (!fs.existsSync(script)) return 0;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-ss-home-'));
  try {
    return execFileSync('bash', [script], { encoding: 'utf8', env: { HOME: home, PATH: '/usr/bin:/bin', CLAUDE_PLUGIN_ROOT: pluginDir } }).length;
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

/** Input tokens (input + cache read + cache creation) of the first main-thread assistant message. */
export function firstTurnInputTokens(lines) {
  const first = lines.find((o) => o.type === 'assistant' && !o.parent_tool_use_id && o.message?.usage);
  if (!first) return null;
  const u = first.message.usage;
  return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
}

function readVariant(variant, { res, run }) {
  if (!run?.tracePath || !fs.existsSync(run.tracePath)) {
    throw new Error(`measure-session-start: variant ${variant} left no trace (exit ${res.status}): ${run?.error ?? res.stderr.slice(-1000)}`);
  }
  const { lines } = parseTrace(fs.readFileSync(run.tracePath, 'utf8'));
  const tokens = firstTurnInputTokens(lines);
  if (tokens == null) throw new Error(`measure-session-start: variant ${variant} has no first-turn usage in its trace`);
  return { tokens, session_start: sessionStart(lines), cost: (run.costUsd ?? 0) + (run.judgeCostUsd ?? 0) };
}

async function runVariant(dir, { model, env }) {
  const outDir = path.join(path.dirname(dir), `${path.basename(dir)}-out`);
  fs.mkdirSync(outDir, { recursive: true });
  const json = path.join(outDir, 'aggregate-result.json');
  const args = ['plugin', 'eval', dir, '--model', model, '--runs', '1', '--ablation', 'none', '--trust-plugin', '--no-publish',
    '--keep-temp', '--threshold', '0', '--output-dir', outDir, '--json', json];
  const res = await spawnClaude(args, { env });
  let aggregate = null;
  try { aggregate = JSON.parse(fs.readFileSync(json, 'utf8')); } catch { /* reported by the caller */ }
  return { res, aggregate, run: aggregate?.cases?.[0]?.arms?.with?.[0] ?? null };
}

/** Measure all variants at pluginRef (or pluginSrc when given, for tests). */
export async function measureSessionStart({ pluginRef = 'v3.4.0', pluginSrc = null, model = 'sonnet', env = process.env } = {}) {
  const worktree = pluginSrc ? null : addWorktree(pluginRef);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-ss-'));
  const runs = {};
  try {
    const dirs = buildVariants(pluginSrc ?? path.join(worktree, 'plugins', 'ai-flow'), root);
    for (const v of VARIANTS) runs[v] = await runVariant(dirs[v], { model, env });
    const m = Object.fromEntries(VARIANTS.map((v) => [v, readVariant(v, runs[v])]));
    const shipped = m['as-shipped'].session_start;
    return {
      plugin_ref: pluginRef, model, claude_version: runs.full.aggregate?.claudeVersion ?? 'unknown', date: new Date().toISOString(),
      first_turn_input_tokens: Object.fromEntries(VARIANTS.map((v) => [v, m[v].tokens])),
      as_shipped: { hook_outcome: shipped.hook_outcome, exit_code: shipped.exit_code, injected_tokens: shipped.injected_tokens_est,
        input_delta_tokens: m['as-shipped'].tokens - m['no-hooks'].tokens },
      intended: { hook_tokens: m.full.tokens - m['no-hooks'].tokens, hook_chars: hookChars(dirs.full),
        always_on_tokens: m['no-hooks'].tokens - m.empty.tokens,
        method: 'first-turn input delta on temp plugin copies (full+x minus no-hooks; no-hooks minus empty)' },
      full_hook: { hook_outcome: m.full.session_start.hook_outcome, exit_code: m.full.session_start.exit_code, stdout_chars: m.full.session_start.stdout_chars },
      cost_usd: Math.round(VARIANTS.reduce((n, v) => n + m[v].cost, 0) * 1e6) / 1e6,
    };
  } finally {
    for (const r of Object.values(runs)) if (r.run?.tracePath) removeKeptTemp(path.dirname(path.dirname(r.run.tracePath)));
    fs.rmSync(root, { recursive: true, force: true });
    removeWorktree(worktree);
  }
}

function argValue(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}

async function main(argv = process.argv.slice(2)) {
  const r = await measureSessionStart({ pluginRef: argValue(argv, '--plugin-ref', 'v3.4.0'), model: argValue(argv, '--model', process.env.AIFLOW_EVAL_MODEL || 'sonnet') });
  const text = JSON.stringify(r, null, 2);
  const out = argValue(argv, '--out', null);
  if (out) fs.writeFileSync(out, text + '\n');
  console.log(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(5); });
}
