#!/usr/bin/env node
// Eval runner (REQ-013, design D2/D3/D11). Pipeline:
//   worktree at --plugin-ref + evals overlay -> `claude plugin eval` -> per run: analyze trace + grade outcome
//   -> summary.json -> cleanup.
// Usage: evals/run.sh [--case <id>...] [--tag <t>...] [--runs N] [--model M] [--judge-model J] [--plugin-ref REF]
//                     [--max-cost-usd X (optional, off by default)] [-j N] [--out DIR] [--keep-artifacts] [--unsafe-host-grading]
//                     [--compare <baseline.json>] [--gate] [--dry-run] [--retry-harness-errors N]
//                     [--promote <version> [--session-start <measure-session-start.json>]] [--resume <results-dir>]
//   --promote  also measures SessionStart (measure-session-start.mjs) unless --session-start overrides it
//   --gate     full suite, runs 3, harness-error retries, compare against baselines/v3.4.0-<model>.json
//   --dry-run  print the resolved plan as JSON and spawn nothing
//   --resume   complete a stopped suite (e.g. rate-limited): keep the clean runs in <results-dir>/runs and re-run
//              only the missing or harness-error case x run slots (one `--case <id> --runs <missing>` per case);
//              output goes to --out (default <results-dir>)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeTrace } from './analyze.mjs';
import { gradeOutcome } from './grade-outcome.mjs';
import { caseId, summarize } from './summarize.mjs';
import { spawnClaude } from './lib/claude.mjs';
import { loadConfig } from './lib/config.mjs';
import { addWorktree, behaviorHash, overlayEvals, removeWorktree, revParse } from './lib/git.mjs';
import { sandboxNodeStrategy } from './lib/node-runtime.mjs';
import { EVALS_DIR, PLUGIN_DIR } from './lib/paths.mjs';
import { discover } from './lib/discover.mjs';
import { compare, formatTable } from './compare.mjs';
import { promote } from './promote.mjs';
import { assembleRunMetrics, harnessErrorMetrics } from './lib/metrics.mjs';
import { assertValid, loadSchema } from './lib/schema.mjs';
import { loadSentinels } from './lib/env.mjs';
import { classifyRun, exitCodeFor } from './lib/classify.mjs';
import { removeKeptTemp, reportPreflight, runPreflight } from './preflight.mjs';
import { utilizationWarning } from './lib/ratelimit.mjs';
import { measureSessionStart } from './measure-session-start.mjs';

export const EXIT = { OK: 0, REGRESSION: 1, COST_CAP: 2, PREFLIGHT: 3, PROJECTION: 4, HARNESS: 5 };


export function parseArgs(argv) {
  const o = { cases: [], tags: [], runs: null, model: process.env.AIFLOW_EVAL_MODEL || 'sonnet', judgeModel: 'haiku', pluginRef: 'HEAD', cap: null, concurrency: 1, out: null, keep: false, unsafeHostGrading: false, gate: false, dryRun: false, compare: null, retryHarness: null, promote: null, sessionStart: null, resume: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--case') o.cases.push(next());
    else if (a === '--tag') o.tags.push(next());
    else if (a === '--gate') o.gate = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--compare') o.compare = next();
    else if (a === '--retry-harness-errors') o.retryHarness = Number(next());
    else if (a === '--promote') o.promote = next();
    else if (a === '--session-start') o.sessionStart = next();
    else if (a === '--resume') o.resume = next();
    else if (a === '--runs') o.runs = Number(next());
    else if (a === '--model') o.model = next();
    else if (a === '--judge-model') o.judgeModel = next();
    else if (a === '--plugin-ref') o.pluginRef = next();
    else if (a === '--max-cost-usd') o.cap = Number(next());
    else if (a === '-j') o.concurrency = Number(next());
    else if (a === '--out') o.out = next();
    else if (a === '--keep-artifacts') o.keep = true;
    else if (a === '--unsafe-host-grading') o.unsafeHostGrading = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (o.gate) {
    o.cases = [];
    o.tags = [];
    o.runs = 3;
    o.compare ??= path.join(baselinesDir(), `v3.4.0-${o.model}.json`);
  }
  o.subset = o.cases.length > 0 || o.tags.length > 0;
  o.runs ??= o.subset ? 1 : 3;
  o.retryHarness ??= o.gate || o.promote ? 2 : 0;
  // No USD cap by default: evals run on Claude Code subscriptions, not API billing (user decision 2026-10-16).
  // --max-cost-usd stays available as an optional native CLI ceiling. Cost is still recorded as a metric.
  return o;
}

export const baselinesDir = (env = process.env) => env.AIFLOW_EVAL_BASELINES_DIR || path.join(EVALS_DIR, 'baselines');

/** Case ids selected by --case / --tag (all discovered cases when neither is given). */
export function selectCases(o, pluginDir = PLUGIN_DIR) {
  const all = discover(pluginDir);
  return all.filter((c) => (o.cases.length === 0 || o.cases.includes(c.id)) && (o.tags.length === 0 || o.tags.some((t) => (c.data.tags ?? []).includes(t)))).map((c) => c.id);
}

/** Case ids are the leading letter of the case name (a-e2e-bugfix-slugify -> a); the CLI filters by name glob. */
export const caseGlob = (id) => (/^[a-z]$/.test(id) ? `${id}-*` : id);

/**
 * CLI case selection. `claude plugin eval` honours ONE --case glob (the last wins) and ORs repeated --tag values,
 * combining --case and --tag with AND (probed on 2.1.302, P4.6). So one case goes as `--case <id>-*`, several as
 * `--tag case-<id>` each (every case carries its case-<id> tag); --case plus --tag is resolved locally first.
 */
export function selectionArgs(o) {
  const ids = o.cases.length && o.tags.length ? (o.selected ?? selectCases(o)) : o.cases;
  if (ids.length === 1) return ['--case', caseGlob(ids[0])];
  if (ids.length > 1) return ids.flatMap((id) => ['--tag', `case-${id}`]);
  return o.tags.flatMap((t) => ['--tag', t]);
}

export function evalArgs(pluginDir, o, outDir) {
  const args = ['plugin', 'eval', pluginDir, '--ablation', 'none', '--scaffold', '--trust-plugin', '--no-publish', '--keep-temp',
    '--threshold', '0', '--model', o.model, '--judge-model', o.judgeModel, '--runs', String(o.runs)];
  if (o.cap != null) args.push('--max-cost-usd', String(o.cap));
  args.push('-j', String(o.concurrency));
  args.push(...selectionArgs(o));
  args.push('--output-dir', outDir, '--allow-tools', 'Bash', 'Write', 'Edit', '--json', path.join(outDir, 'aggregate-result.json'));
  return args;
}

function keptDirOf(tracePath) {
  return tracePath ? path.dirname(path.dirname(tracePath)) : null;
}

/** Workspace of a kept run: <kept>/sealed/home/cwd (CLI 2.1.301; sealed is d---------), else <kept>/home/cwd. */
export function workspaceOf(keptDir) {
  const sealed = path.join(keptDir, 'sealed');
  if (fs.existsSync(sealed)) {
    try { fs.chmodSync(sealed, 0o700); } catch { /* not ours to change: fall through */ }
    const ws = path.join(sealed, 'home', 'cwd');
    if (fs.existsSync(ws)) return ws;
  }
  return path.join(keptDir, 'home', 'cwd');
}

const RUN_SCHEMA = loadSchema('run-metrics');

export function runMetrics({ caseName, index, run, caseDir, o, sentinels }) {
  const keptDir = keptDirOf(run.tracePath);
  const extra = { artifacts_dir: { kept_dir: keptDir, trace: run.tracePath ?? null } };
  const traceExists = Boolean(run.tracePath && fs.existsSync(run.tracePath));
  const analysis = traceExists ? analyzeTrace(fs.readFileSync(run.tracePath, 'utf8'), { caseName, sentinels }) : null;
  const cls = classifyRun(run, { traceExists, lastMainText: analysis?.last_main_text ?? '' });
  let m;
  if (cls.harness_error) {
    m = harnessErrorMetrics({ caseName, index, run, reason: cls.failure_reason, extra });
  } else {
    let outcome = null;
    let harness = false;
    let errorRaw = null;
    try {
      outcome = gradeOutcome({ workspace: workspaceOf(keptDir), caseDir, unsafeHostGrading: o.unsafeHostGrading });
    } catch (e) {
      harness = true;
      errorRaw = `grading-unavailable: ${e.message}`;
    }
    m = assembleRunMetrics({ caseName, index, run, analysis, outcome, failureReason: harness ? 'grading_unavailable' : cls.failure_reason, harnessError: harness, extra });
    if (errorRaw) m.error_raw = errorRaw;
  }
  if (analysis && Object.keys(analysis.rate_limit).length) m.rate_limit = analysis.rate_limit;
  return assertValid(RUN_SCHEMA, m, `run metrics ${caseName}#${index}`);
}

/** Highest utilization per rate-limit window across runs (informational; decision 2). */
export function mergeRateLimits(runs) {
  const out = {};
  for (const [w, st] of runs.flatMap((r) => Object.entries(r.rate_limit ?? {}))) if (!out[w] || st.utilization >= out[w].utilization) out[w] = st;
  return out;
}

const rateLimited = (runs) => runs.some((r) => r.failure_reason === 'rate_limited');

/**
 * Prior state of a stopped suite (--resume): clean runs of the selected cases (run_index < runs) are kept;
 * every other slot is missing. priorCost is the prior summary's total spend (else the sum of its run costs).
 */
export function resumeState(dir, caseIds, runs) {
  const runsDir = path.join(dir, 'runs');
  const prior = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf8')));
  const kept = prior.filter((r) => !r.harness_error && caseIds.includes(caseId(r.case)) && r.run_index < runs);
  const missing = {};
  for (const id of caseIds) {
    const have = new Set(kept.filter((r) => caseId(r.case) === id).map((r) => r.run_index));
    const slots = Array.from({ length: runs }, (_, i) => i).filter((i) => !have.has(i));
    if (slots.length) missing[id] = slots;
  }
  const summaryFile = path.join(dir, 'summary.json');
  const priorMeta = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')).meta ?? {} : {};
  const priorCost = priorMeta.total_cost_usd ?? prior.reduce((n, r) => n + (r.cli?.costUsd ?? 0), 0);
  return { kept, missing, priorCost, claudeVersion: priorMeta.claude_version ?? null };
}

export async function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (o.compare && !fs.existsSync(o.compare)) {
    console.error(`runner: baseline not found: ${o.compare} (capture it with --promote, or pass --compare <file>)`);
    return EXIT.PREFLIGHT;
  }
  if (o.resume && !fs.existsSync(path.join(o.resume, 'runs'))) {
    console.error(`runner: --resume: no runs/ in ${o.resume} (pass the results dir of the stopped suite)`);
    return EXIT.PREFLIGHT;
  }
  if (o.dryRun) {
    const plan = { cases: selectCases(o), runs: o.runs, cap_usd: o.cap, model: o.model, judge_model: o.judgeModel, plugin_ref: o.pluginRef, subset: o.subset, tags: o.tags, retry_harness_errors: o.retryHarness, compare: o.compare, promote: o.promote, args: evalArgs('<plugin>', o, '<out>') };
    console.log(JSON.stringify(plan, null, 2));
    return EXIT.OK;
  }
  if (!reportPreflight(runPreflight({ unsafeHostGrading: o.unsafeHostGrading }))) return EXIT.PREFLIGHT;
  const strategy = sandboxNodeStrategy({ config: loadConfig() });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(o.out ?? o.resume ?? path.join(EVALS_DIR, 'results', stamp));
  fs.mkdirSync(path.join(outDir, 'runs'), { recursive: true });

  if (o.cap != null && o.concurrency > 1) {
    console.error(`runner: warning: --max-cost-usd with -j ${o.concurrency}: up to ${o.concurrency} in-flight runs can overrun the cap (at -j 1 the overrun is at most one run)`);
  }
  const sentinels = loadSentinels(process.env.AIFLOW_EVAL_SENTINELS);
  const worktree = addWorktree(o.pluginRef);
  const runs = [];
  const fresh = []; // runs produced by this invocation (only their kept temp dirs are ours to clean up)
  let aggregate = null;
  let summary = null;
  try {
    overlayEvals(worktree);
    const pluginDir = path.join(worktree, 'plugins', 'ai-flow');
    const env = { ...process.env, PATH: strategy.pathPrefix.join(path.delimiter) + path.delimiter + (process.env.PATH ?? '') };
    const invoke = async (opts, dir) => {
      fs.mkdirSync(dir, { recursive: true });
      const res = await spawnClaude(evalArgs(pluginDir, opts, dir), { env, onStderr: (s) => process.stderr.write(s) });
      try { return JSON.parse(fs.readFileSync(path.join(dir, 'aggregate-result.json'), 'utf8')); } catch {
        throw new Error(`claude plugin eval produced no aggregate JSON (exit ${res.status}): ${res.stderr.slice(-2000)}`);
      }
    };
    const record = (m) => fs.writeFileSync(path.join(outDir, 'runs', `${caseId(m.case)}-${m.run_index}.json`), JSON.stringify(m, null, 2));
    const collect = (agg, indexOf) => {
      for (const c of agg.cases ?? []) {
        const caseDir = path.join(pluginDir, 'evals', 'cases', c.name);
        (c.arms?.with ?? []).forEach((run, k) => {
          const m = runMetrics({ caseName: c.name, index: indexOf(c.name, k), run, caseDir, o, sentinels });
          record(m);
          runs.push(m);
          fresh.push(m);
        });
      }
    };
    let spent;
    let priorCost = 0;
    if (o.resume) {
      const st = resumeState(path.resolve(o.resume), selectCases(o), o.runs);
      priorCost = st.priorCost;
      for (const m of st.kept) { record(m); runs.push(m); }
      aggregate = { costUsd: 0, claudeVersion: st.claudeVersion, partial: false, cases: [] };
      for (const [id, slots] of Object.entries(st.missing)) {
        if (rateLimited(runs)) break;
        const agg = await invoke({ ...o, cases: [id], tags: [], runs: slots.length }, path.join(outDir, `resume-${id}`));
        aggregate.costUsd += agg.costUsd ?? 0;
        aggregate.claudeVersion = agg.claudeVersion ?? aggregate.claudeVersion;
        collect(agg, (_, k) => slots[k]);
        if (agg.partial) { aggregate.partial = true; break; }
      }
    } else {
      aggregate = await invoke(o, outDir);
      collect(aggregate, (_, k) => k);
    }
    spent = aggregate.costUsd ?? 0;
    // Harness-error retries (U5): re-run a failed slot as `--case <id> --runs 1`, up to retryHarness times.
    // Never after a rate limit (user decision: stop and report). With a cap, each retry gets the remaining budget.
    let attempt = 0;
    const slotOf = (s) => runs.findIndex((r) => r.case === s.case && r.run_index === s.run_index);
    for (const slot of runs.filter((r) => r.harness_error)) {
      if (aggregate.partial) break;
      for (let k = 1; k <= o.retryHarness && runs[slotOf(slot)].harness_error; k++) {
        if (rateLimited(runs)) break;
        const remaining = o.cap == null ? null : Math.round((o.cap - spent) * 1000) / 1000;
        if (remaining != null && remaining <= 0) break;
        const id = caseId(slot.case);
        const agg = await invoke({ ...o, cases: [id], tags: [], runs: 1, cap: remaining }, path.join(outDir, `retry-${++attempt}`));
        spent += agg.costUsd ?? 0;
        const c = (agg.cases ?? [])[0];
        const run = c?.arms?.with?.[0];
        if (!run) break;
        const m = runMetrics({ caseName: c.name, index: slot.run_index, run, caseDir: path.join(pluginDir, 'evals', 'cases', c.name), o, sentinels });
        m.retried = k;
        const at = slotOf(slot);
        removeKeptTemp(runs[at].artifacts_dir.kept_dir);
        runs[at] = m;
        fresh.push(m);
        record(m);
        if (agg.partial) { aggregate.partial = true; break; }
      }
    }
    aggregate.costUsd = Math.round(spent * 1e6) / 1e6;
    const pluginJson = JSON.parse(fs.readFileSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8'));
    const meta = {
      plugin_version: pluginJson.version, plugin_ref: o.pluginRef, plugin_sha: revParse(o.pluginRef), evals_sha: revParse('HEAD'),
      behavior_hash: behaviorHash(pluginDir), claude_version: aggregate.claudeVersion ?? 'unknown', model: o.model, judge_model: o.judgeModel,
      date: new Date().toISOString(), runs_per_case: o.runs, cap_usd: o.cap ?? null,
      cases_run: [...new Set(runs.map((r) => caseId(r.case)))].sort(),
      complete: !aggregate.partial && !rateLimited(runs), incomplete_reason: rateLimited(runs) ? 'rate_limited' : aggregate.partial ? 'cost_cap' : null,
      total_cost_usd: Math.round((priorCost + (aggregate.costUsd ?? 0)) * 1e6) / 1e6, subset: o.subset, worktree, results_dir: outDir,
      rate_limit: mergeRateLimits(runs),
    };
    if (o.resume) meta.resumed_from = path.resolve(o.resume);
    const warning = utilizationWarning(meta.rate_limit);
    if (warning) console.error(`runner: ${warning}`);
    // D10: --promote measures the intended SessionStart cost on temp plugin copies (4 tiny runs) unless a
    // --session-start <file> override is given.
    let intended = null;
    if (o.sessionStart) intended = JSON.parse(fs.readFileSync(o.sessionStart, 'utf8')).intended ?? null;
    else if (o.promote && !rateLimited(runs)) {
      const ss = await measureSessionStart({ pluginRef: o.pluginRef, model: o.model, env });
      fs.writeFileSync(path.join(outDir, 'session-start.json'), JSON.stringify(ss, null, 2));
      intended = ss.intended;
    }
    summary = summarize(runs, meta, { sessionStartIntended: intended });
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  } finally {
    if (!o.keep) {
      for (const m of fresh) removeKeptTemp(m.artifacts_dir.kept_dir);
      removeWorktree(worktree);
    }
  }
  console.log(`summary: ${path.join(outDir, 'summary.json')}`);
  let regression = false;
  if (o.compare) {
    const cmp = compare(JSON.parse(fs.readFileSync(o.compare, 'utf8')), summary);
    fs.writeFileSync(path.join(outDir, 'compare.json'), JSON.stringify(cmp, null, 2));
    if (cmp.envMismatch.length) console.error(`runner: compare refused: ${cmp.envMismatch.join('; ')}`);
    console.log(formatTable(cmp.rows));
    console.log(`regressions: ${cmp.regressions}`);
    regression = cmp.exitCode !== 0;
  }
  let promoteRefused = false;
  if (o.promote) {
    try {
      console.log(`baseline: ${promote(summary, { version: o.promote, outDir: baselinesDir() })}`);
    } catch (e) {
      if (e.code !== 'PROMOTE_REFUSED') throw e;
      console.error(e.message);
      promoteRefused = true;
    }
  }
  if (rateLimited(runs)) {
    console.error('runner: stopped: a run hit the subscription rate limit (harness error, not retried). Wait for the limit window to reset, then re-run.');
    return EXIT.HARNESS;
  }
  if (aggregate.partial) {
    console.error(`runner: stopped: the CLI cost cap ($${o.cap}) was reached; suite incomplete (cost_cap) after ${runs.length} run(s), spend $${aggregate.costUsd ?? 0}`);
  }
  const harnessRuns = runs.filter((r) => r.harness_error);
  if (harnessRuns.length) console.error(`runner: ${harnessRuns.length} harness-error run(s): ${harnessRuns.map((r) => `${caseId(r.case)}#${r.run_index} ${r.failure_reason ?? ''}`.trim()).join(', ')}`);
  return exitCodeFor({ costCap: aggregate.partial, harness: harnessRuns.length > 0, promoteRefused, regression });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code), (e) => { console.error(e.stack || e.message); process.exit(EXIT.HARNESS); });
}
