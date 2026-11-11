#!/usr/bin/env node
// Preflight checks for the evals runner. `--probe-node` runs one cheap live probe (haiku) that checks
// Node 26, npm and vitest inside the eval sandbox (design D9, user decision U2). Exit 3 on failure.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { claudeBin, spawnClaude } from './lib/claude.mjs';
import { CACHE_DIR, EVALS_DIR, TOOLING_DIR } from './lib/paths.mjs';
import { utilizationWarning } from './lib/ratelimit.mjs';
import { resolveNode26, sandboxNodeStrategy } from './lib/node-runtime.mjs';
import { loadConfig } from './lib/config.mjs';
import { loadKept, mergeNested, reconcileMocks } from './lib/nested.mjs';
import { parseTrace } from './lib/trace.mjs';
import { classifyRunError } from './lib/classify.mjs';

const PROBE_TEMPLATES = path.join(TOOLING_DIR, 'probe');
const NESTED_TEMPLATES = path.join(TOOLING_DIR, 'probe-nested');

export const NODE_REMEDIES = `Node 26 is not usable inside the eval sandbox. Remedies, in order (nvm Node 26 only; no other installs):
  R1 sandbox read-allow: grant the eval run read access to the Node 26 install.
  R2 staged runtime on PATH: prepend .eval-cache/node26/bin (run: node plugins/ai-flow/evals/tooling/prepare.mjs).
  R3 clone into the workspace: the scaffold clones .eval-cache/node26 into <workspace>/.eval-node/.
  R4 runner-chosen temp root: stage the runtime into a temp root that the sandbox can read.
Record the winning strategy in plugins/ai-flow/evals/tooling/config.json ("node": {"strategy": ...}).`;

/** Remove a kept eval temp dir (its root is read-only: dr-x------). */
export function removeKeptTemp(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  try { execFileSync('chmod', ['-R', 'u+rwx', dir], { stdio: 'ignore' }); } catch { /* rm below reports leftovers */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFrom(template, dest, replacements = {}, mode = 0o644) {
  let text = fs.readFileSync(path.join(PROBE_TEMPLATES, template), 'utf8');
  for (const [k, v] of Object.entries(replacements)) text = text.split(k).join(v);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text, { mode });
}

/** Materialize the probe plugin into a temp dir (never under ai-flow's evals/, so it is not discovered). */
export function materializeProbe({ cacheDir = CACHE_DIR, strategyHook = ':' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-probe-'));
  const caseDir = path.join(root, 'evals', 'node-probe');
  writeFrom('plugin.json.tmpl', path.join(root, '.claude-plugin', 'plugin.json'));
  writeFrom('prompt.md.tmpl', path.join(caseDir, 'prompt.md'));
  writeFrom('case.yaml.tmpl', path.join(caseDir, 'case.yaml'));
  writeFrom('scaffold.sh.tmpl', path.join(caseDir, 'scaffold.sh'), { __CACHE_DIR__: cacheDir, __STRATEGY_HOOK__: strategyHook }, 0o755);
  fs.mkdirSync(path.join(caseDir, 'graders'), { recursive: true });
  fs.copyFileSync(path.join(PROBE_TEMPLATES, 'graders', 'ran.md'), path.join(caseDir, 'graders', 'ran.md'));
  return root;
}

/** PATH used for the eval child, per node strategy. */
export function probePath(strategy, env) {
  if (strategy?.pathPrefix) return strategy.pathPrefix.join(path.delimiter) + path.delimiter + (env.PATH ?? '');
  let nvmBin = null;
  try { nvmBin = path.join(resolveNode26({ env }), 'bin'); } catch { /* no nvm 26: leave PATH as is */ }
  return (nvmBin ? nvmBin + path.delimiter : '') + (env.PATH ?? '');
}

/** Text of every Bash tool_result in a trace, in order. */
export function bashResults(tracePath) {
  const ids = new Set();
  const out = [];
  for (const line of fs.readFileSync(tracePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const content = o.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (o.type === 'assistant' && c.type === 'tool_use' && c.name === 'Bash') ids.add(c.id);
      if (o.type === 'user' && c.type === 'tool_result' && ids.has(c.tool_use_id)) {
        out.push(typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x.text ?? '').join(''));
      }
    }
  }
  return out;
}

/** Classify the probe's Bash output. */
export function classifyProbeOutput(text) {
  if (text == null) return { ok: false, reason: 'no-bash-result' };
  const node = text.match(/\bv(\d+)\.\d+\.\d+\b/);
  const npm = text.match(/^(\d+\.\d+\.\d+)\s*$/m);
  const passed = text.match(/Tests\s+(\d+) passed/);
  const base = { node: node ? node[0] : null, npm: npm ? npm[1] : null, testsPassed: passed ? Number(passed[1]) : 0 };
  if (/Cannot find module[^\n]*npm/.test(text)) return { ok: false, reason: 'npm-unreadable', ...base };
  if (/Operation not permitted/.test(text)) return { ok: false, reason: 'sandbox-denied', ...base };
  if (!node || node[1] !== '26') return { ok: false, reason: 'node-not-26', ...base };
  if (!npm) return { ok: false, reason: 'npm-unreadable', ...base };
  if (!passed || /Tests\s+[^\n]*\d+ failed/.test(text)) return { ok: false, reason: 'tests-not-run', ...base };
  return { ok: true, reason: null, ...base };
}

/** Run the live probe (paid: one haiku run) and classify the outcome. */
export async function probeSandboxNode({ env = process.env, strategy = { name: 'none' }, model = 'haiku', keep = false } = {}) {
  const pluginDir = materializeProbe({ strategyHook: strategy.scaffoldHook ?? ':' });
  const outDir = path.join(pluginDir, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'aggregate-result.json');
  const args = ['plugin', 'eval', pluginDir, '--model', model, '--runs', '1', '--ablation', 'none', '--scaffold',
    '--trust-plugin', '--no-publish', '--keep-temp', '--threshold', '0', '--output-dir', outDir,
    '--allow-tools', 'Bash', '--json', jsonPath];
  const childEnv = { ...env, PATH: probePath(strategy, env) };
  const res = await spawnClaude(args, { env: childEnv });
  let aggregate = null;
  try { aggregate = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch { /* reported below */ }
  const run = aggregate?.cases?.[0]?.arms?.with?.[0];
  let result;
  if (!run?.tracePath || !fs.existsSync(run.tracePath)) {
    result = { ok: false, reason: 'no-trace', error: run?.error ?? (res.stderr || '').slice(0, 2000) };
  } else {
    const texts = bashResults(run.tracePath);
    result = { ...classifyProbeOutput(texts.length ? texts.join('\n') : null), output: texts.join('\n').slice(0, 4000) };
  }
  result.strategy = strategy.name;
  result.costUsd = aggregate?.costUsd ?? null;
  result.exitCode = res.status;
  if (!keep) {
    if (run?.tracePath) removeKeptTemp(path.dirname(path.dirname(run.tracePath)));
    fs.rmSync(pluginDir, { recursive: true, force: true });
  } else {
    result.pluginDir = pluginDir;
    result.tracePath = run?.tracePath;
  }
  return result;
}

/** Where each probe-nested template goes in the materialized plugin (the .tmpl suffix is dropped). */
const NESTED_LAYOUT = {
  'plugin.json.tmpl': '.claude-plugin/plugin.json',
  'agents/outer.md.tmpl': 'agents/outer.md', 'agents/middle.md.tmpl': 'agents/middle.md', 'agents/leaf.md.tmpl': 'agents/leaf.md',
  'prompt.md.tmpl': 'evals/nest/prompt.md', 'graders/ran.md.tmpl': 'evals/nest/graders/ran.md',
  'mocks/memx/_server.md.tmpl': 'evals/mocks/memx/_server.md', 'mocks/memx/_tools.json.tmpl': 'evals/mocks/memx/_tools.json',
};

/** Materialize tooling/probe-nested into a temp plugin dir (B2b D9). */
export function materializeNestedProbe() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-nested-probe-'));
  for (const [src, dest] of Object.entries(NESTED_LAYOUT)) {
    fs.mkdirSync(path.dirname(path.join(root, dest)), { recursive: true });
    fs.copyFileSync(path.join(NESTED_TEMPLATES, src), path.join(root, dest));
  }
  return root;
}

const sessionIdOf = (lines) => lines.find((o) => o.type === 'system' && o.subtype === 'init')?.session_id ?? null;

/**
 * Nested-capture canary (B2b D9; paid: one haiku run, about $0.01). Runs probe-nested and checks what a gate relies
 * on: transcripts for depths 1, 2 and 3 under the kept config dir, the depth-3 Write in the merged stream, and the
 * CLI's W5 mock-accounting run-error (if any) reconciled with the transcripts.
 * Returns { ok, reason, depths, leaf_write, run_error_class, costUsd }.
 */
export async function nestedCanary({ env = process.env, model = 'haiku' } = {}) {
  const pluginDir = materializeNestedProbe();
  const outDir = path.join(pluginDir, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'aggregate-result.json');
  const args = ['plugin', 'eval', pluginDir, '--model', model, '--runs', '1', '--ablation', 'none', '--trust-plugin', '--no-publish',
    '--keep-temp', '--threshold', '0', '--output-dir', outDir, '--allow-tools', 'Agent', 'ToolSearch', 'Write', 'Bash', 'Read', '--json', jsonPath];
  const res = await spawnClaude(args, { env });
  let aggregate = null;
  try { aggregate = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch { /* reported below */ }
  const run = aggregate?.cases?.[0]?.arms?.with?.[0];
  const out = { ok: false, reason: null, depths: [], leaf_write: false, run_error_class: null, costUsd: aggregate?.costUsd ?? null };
  try {
    if (!run?.tracePath || !fs.existsSync(run.tracePath)) return { ...out, reason: `no trace (exit ${res.status}): ${run?.error ?? (res.stderr || '').slice(-500)}` };
    const kept = path.dirname(path.dirname(run.tracePath));
    const raw = parseTrace(fs.readFileSync(run.tracePath, 'utf8')).lines;
    const bundle = loadKept(kept, sessionIdOf(raw));
    const merged = mergeNested(raw, bundle);
    out.depths = [...new Set(bundle.agents.map((a) => a.meta.spawnDepth))].sort((a, b) => a - b);
    out.leaf_write = merged.lines.some((l) => l.agent_depth === 3 && l.type === 'assistant' && (l.message?.content ?? []).some((c) => c.type === 'tool_use' && c.name === 'Write'));
    if (!bundle.agents.length) return { ...out, reason: `no subagent transcripts found at ${bundle.location}` };
    const missingDepth = [1, 2, 3].filter((d) => !out.depths.includes(d));
    if (missingDepth.length) return { ...out, reason: `no transcript at depth ${missingDepth.join(', ')} (found depths ${out.depths.join(', ') || 'none'})` };
    if (!out.leaf_write) return { ...out, reason: 'the depth-3 Write is not in the merged stream' };
    if (run.error) {
      const re = classifyRunError(run.error, { nested_capture: merged.capture, mock_accounting: reconcileMocks(raw, merged.lines, { mockCalls: bundle.mockCalls, mockCallsFile: bundle.mock_calls_file }) });
      out.run_error_class = re.class;
      if (re.class !== 'nested_mock_accounting') return { ...out, reason: `W5 run-error not reconciled: ${re.reason}` };
    }
    return { ...out, ok: true };
  } finally {
    if (run?.tracePath) removeKeptTemp(path.dirname(path.dirname(run.tracePath)));
    fs.rmSync(pluginDir, { recursive: true, force: true });
  }
}

/**
 * The canary as a preflight check: { check: 'nested-canary', ok, message, result, attempts }. A failed attempt is
 * retried once with a fresh run (the haiku outer agent occasionally does not launch the middle one); every attempt's
 * { ok, reason, depths } is recorded and the message names the attempt count.
 */
export async function runNestedCanaryCheck({ env = process.env, canary = nestedCanary, maxAttempts = 2 } = {}) {
  const attempts = [];
  let r;
  do {
    r = await canary({ env });
    attempts.push({ ok: r.ok, reason: r.reason ?? null, depths: r.depths ?? [], costUsd: r.costUsd ?? null });
  } while (!r.ok && attempts.length < maxAttempts);
  const earlier = attempts.slice(0, -1).map((a, i) => `attempt ${i + 1} failed: ${a.reason}`).join('; ');
  const message = r.ok
    ? `nested capture ok (depths ${r.depths.join(', ')}${r.run_error_class ? `, W5 ${r.run_error_class}` : ''}; attempt ${attempts.length} of ${maxAttempts}${earlier ? `; ${earlier}` : ''})`
    : `nested capture canary failed after ${attempts.length} attempts: ${attempts.map((a, i) => `attempt ${i + 1}: ${a.reason}`).join('; ')}. The CLI may have changed where it writes subagent transcripts (expected <kept>/config/projects/<slug>/<session>/subagents/, see lib/nested.mjs keptSubagentsDir); fix that before a paid gate, or pass --skip-nested-canary to run without the check (nested capture may then be reported failed)`;
  return { check: 'nested-canary', ok: r.ok, message, result: r, attempts };
}

export const MIN_CLAUDE = '2.1.301';
export const MIN_GIT = '2.31.0';
export const NODE_MAJOR = 26;

const semver = (text) => {
  const m = String(text ?? '').match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
};
const semverStr = (v) => v.join('.');
function atLeast(v, min) {
  const m = semver(min);
  for (let i = 0; i < 3; i++) if (v[i] !== m[i]) return v[i] > m[i];
  return true;
}

/**
 * Full preflight (design D9/D5, U2, U5) over gathered facts; pure, so every branch is testable offline.
 * Returns { ok, failures: [{check, message}], warnings: [string] }. Subscription utilization only warns.
 */
export function preflightChecks({ claudeVersion, gitVersion, nodeVersion, cacheDir = CACHE_DIR, which, config, unsafeHostGrading = false, rateLimit = null }) {
  const failures = [];
  const fail = (check, message) => failures.push({ check, message });
  const cv = semver(claudeVersion);
  if (!cv) fail('claude', `claude CLI not found or unreadable version; install Claude Code >= ${MIN_CLAUDE} (or set AIFLOW_EVAL_CLAUDE_BIN)`);
  else if (!atLeast(cv, MIN_CLAUDE)) fail('claude', `claude ${semverStr(cv)} is older than ${MIN_CLAUDE} (plugin eval flags/trace format); run: claude update`);
  const gv = semver(gitVersion);
  if (!gv) fail('git', `git not found; install git >= ${MIN_GIT}`);
  else if (!atLeast(gv, MIN_GIT)) fail('git', `git ${semverStr(gv)} is older than ${MIN_GIT} (worktree --detach/--quiet behaviour); upgrade git`);
  const nv = semver(nodeVersion);
  if (!nv || nv[0] !== NODE_MAJOR) fail('node', `host node is ${nodeVersion ?? 'missing'}; Node ${NODE_MAJOR} is required (run: nvm install ${NODE_MAJOR} && nvm use ${NODE_MAJOR})`);
  const missing = [['textkit', path.join('textkit', 'node_modules')], ['node26', path.join('node26', 'bin')]]
    .filter(([, rel]) => !fs.existsSync(path.join(cacheDir, rel))).map(([name]) => name);
  if (missing.length) fail('cache', `.eval-cache is missing ${missing.join(' and ')} (${cacheDir}); run: node plugins/ai-flow/evals/tooling/prepare.mjs`);
  if (!unsafeHostGrading && !which('sandbox-exec') && !which('bwrap')) {
    fail('sandbox', 'neither sandbox-exec (macOS) nor bwrap (Linux) is available to grade agent code; install bubblewrap, or pass --unsafe-host-grading at your own risk');
  }
  if (!config?.node?.strategy) fail('node-strategy', `no node.strategy recorded in evals/tooling/config.json; run: node plugins/ai-flow/evals/tooling/preflight.mjs --probe-node\n${NODE_REMEDIES}`);
  const warning = utilizationWarning(rateLimit ?? {});
  return { ok: failures.length === 0, failures, warnings: warning ? [warning] : [] };
}

/** meta.rate_limit of the newest results/<stamp>/summary.json (stamps sort chronologically), or null. */
export function latestRateLimit(resultsDir = path.join(EVALS_DIR, 'results')) {
  if (!fs.existsSync(resultsDir)) return null;
  for (const stamp of fs.readdirSync(resultsDir).sort().reverse()) {
    const file = path.join(resultsDir, stamp, 'summary.json');
    if (!fs.existsSync(file)) continue;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')).meta?.rate_limit ?? null; } catch { /* unreadable: try older */ }
  }
  return null;
}

const tryExec = (bin, args, env) => {
  try { return execFileSync(bin, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
};

/** Gather the real facts and run preflightChecks. */
export function runPreflight({ env = process.env, unsafeHostGrading = false, cacheDir = CACHE_DIR, resultsDir } = {}) {
  let config = null;
  try { config = loadConfig(); } catch { /* reported as a missing node.strategy */ }
  return preflightChecks({
    claudeVersion: tryExec(claudeBin(env), ['--version'], env),
    gitVersion: tryExec('git', ['--version'], env),
    nodeVersion: process.version,
    cacheDir,
    which: (bin) => tryExec('/usr/bin/which', [bin], env) != null,
    config,
    unsafeHostGrading,
    rateLimit: latestRateLimit(resultsDir),
  });
}

/** Print the preflight report; returns true when it passed. */
export function reportPreflight(r, log = console.error) {
  for (const w of r.warnings) log(`preflight: ${w}`);
  for (const f of r.failures) log(`preflight: FAIL ${f.check}: ${f.message}`);
  return r.ok;
}

function argValue(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--probe-node')) {
    let strategy;
    const named = argValue(argv, '--strategy', null);
    if (named === 'none') strategy = { name: 'none' };
    else {
      try {
        strategy = sandboxNodeStrategy({ config: named ? { node: { strategy: named } } : loadConfig() });
      } catch (e) {
        console.error(`preflight: ${e.message}\n${NODE_REMEDIES}`);
        process.exit(3);
      }
    }
    const r = await probeSandboxNode({ strategy, model: argValue(argv, '--model', 'haiku'), keep: argv.includes('--keep') });
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) {
      console.error(`preflight: sandbox node probe failed: ${r.reason}\n${NODE_REMEDIES}`);
      process.exit(3);
    }
    return;
  }
  if (argv.length && !argv.every((a) => a === '--unsafe-host-grading')) {
    console.error('usage: preflight.mjs [--unsafe-host-grading] | --probe-node [--strategy <name>] [--model haiku] [--keep]');
    process.exit(64);
  }
  const r = runPreflight({ unsafeHostGrading: argv.includes('--unsafe-host-grading') });
  if (!reportPreflight(r)) process.exit(3);
  console.log('preflight: ok');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(3); });
}
