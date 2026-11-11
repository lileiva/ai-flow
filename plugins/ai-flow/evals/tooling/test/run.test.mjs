// Task 0.12 (REQ-013 S1-S2 minimal; D2; D11): runner pipeline against the stub CLI ($0).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EVALS_DIR, TEXTKIT_CACHE } from '../lib/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUB = path.join(HERE, 'fixtures', 'stub-claude.mjs');
const RUN_SH = path.join(EVALS_DIR, 'run.sh');
const skip = fs.existsSync(path.join(TEXTKIT_CACHE, 'node_modules')) ? false : 'no .eval-cache (run prepare.mjs)';
const created = [];
after(() => { for (const d of created) fs.rmSync(d, { recursive: true, force: true }); });
function tmp(prefix) { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); created.push(d); return d; }

function runWithStub(args, scenario = {}, extraEnv = {}) {
  const dir = tmp('aiflow-runtest-');
  const scenarioFile = path.join(dir, 'scenario.json');
  fs.writeFileSync(scenarioFile, JSON.stringify({ caseName: 'a-e2e-bugfix-slugify', ...scenario }));
  const log = path.join(dir, 'argv.jsonl');
  const out = path.join(dir, 'out');
  // An extraEnv value of null removes that variable (e.g. ANTHROPIC_API_KEY, REQ-015 S3).
  const env = { ...process.env, AIFLOW_EVAL_CLAUDE_BIN: STUB, AIFLOW_STUB_SCENARIO: scenarioFile, AIFLOW_STUB_LOG: log, ...extraEnv };
  for (const [k, v] of Object.entries(env)) if (v === null) delete env[k];
  const res = spawnSync('bash', [RUN_SH, ...args, '--out', out], { encoding: 'utf8', env });
  const argv = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  return { res, argv, out };
}

test('run.sh --case a --runs 1 --model sonnet drives `claude plugin eval` with the pinned flags', { skip }, () => {
  const { res, argv } = runWithStub(['--case', 'a', '--runs', '1', '--model', 'sonnet']);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.equal(argv.length, 1);
  const a = argv[0];
  assert.deepEqual(a.slice(0, 2), ['plugin', 'eval']);
  assert.match(a[2], /aiflow-eval-[0-9a-f]{12}-.*\/plugins\/ai-flow$/);
  const joined = a.join(' ');
  for (const frag of ['--ablation none', '--scaffold', '--trust-plugin', '--no-publish', '--keep-temp', '--threshold 0',
    '--allow-tools Bash Write Edit', '--model sonnet', '--judge-model haiku', '--runs 1', '-j 1', '--case a-*', '--json ', '--output-dir ']) {
    assert.ok(joined.includes(frag), `missing "${frag}" in: ${joined}`);
  }
  assert.ok(!a.includes('--max-cost-usd'), 'no USD cap by default (subscription billing; user decision 2026-10-16)');
});

test('--max-cost-usd is optional and passed through only when given', { skip }, () => {
  const { res, argv } = runWithStub(['--case', 'a', '--runs', '1', '--max-cost-usd', '3']);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.ok(argv[0].join(' ').includes('--max-cost-usd 3'));
});

const LIB = path.join(EVALS_DIR, 'fixtures', 'scaffold-lib.sh');
const TRACE = path.join(HERE, 'fixtures', 'traces', 'real-case-a.jsonl');

function fixedWorkspace() {
  const ws = tmp('aiflow-runws-');
  const r = spawnSync('bash', ['-c', `set -e; source "${LIB}"; scaffold_textkit "${path.join(HERE, 'fixtures', 'workspaces', 'a-fixed')}"`], { cwd: ws, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: tmp('aiflow-home-') } });
  assert.equal(r.status, 0, r.stderr);
  return ws;
}

test('runner writes per-run metrics and a schema-valid summary, then cleans up kept dirs and the worktree', { skip }, () => {
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1', '--model', 'sonnet', '--plugin-ref', 'v3.4.0'], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), costUsd: 0.42 });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const runMetrics = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'a-0.json'), 'utf8'));
  assert.ok(runMetrics.tokens.total > 0);
  assert.equal(runMetrics.tdd.pass, true);
  assert.equal(runMetrics.outcome.pass, true);
  assert.equal(runMetrics.harness_error, false);
  const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(summary.meta.model, 'sonnet');
  assert.deepEqual(summary.meta.cases_run, ['a']);
  assert.equal(summary.meta.plugin_ref, 'v3.4.0');
  assert.equal(summary.meta.plugin_version, '3.4.0');
  assert.match(summary.meta.behavior_hash, /^[0-9a-f]{64}$/);
  assert.equal(summary.meta.total_cost_usd, 0.42);
  assert.equal(summary.cases.a.outcome_pass_rate.mean, 1);
  assert.equal(fs.existsSync(runMetrics.artifacts_dir.kept_dir), false, 'kept temp dir removed');
  assert.equal(fs.existsSync(summary.meta.worktree), false, 'worktree removed');
});

test('--keep-artifacts keeps the kept temp dir and the worktree', { skip }, () => {
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1', '--keep-artifacts'], { traceFile: TRACE, workspaceFrom: fixedWorkspace() });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'a-0.json'), 'utf8'));
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.ok(fs.existsSync(m.artifacts_dir.kept_dir));
  assert.ok(fs.existsSync(s.meta.worktree));
  spawnSync('chmod', ['-R', 'u+rwx', m.artifacts_dir.kept_dir]);
  fs.rmSync(m.artifacts_dir.kept_dir, { recursive: true, force: true });
  spawnSync('git', ['worktree', 'remove', '--force', s.meta.worktree]);
});

test('a rate-limited run is a harness error; the runner stops with exit 5 and says so (no retries)', { skip }, () => {
  const { res, out, argv } = runWithStub(['--case', 'a', '--runs', '1'], { traceFile: TRACE, error: 'API Error: 429 rate limit exceeded (seven_day)' });
  assert.equal(res.status, 5, res.stdout + res.stderr);
  assert.equal(argv.length, 1, 'no retry invocations');
  assert.match(res.stderr, /rate limit/i);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'a-0.json'), 'utf8'));
  assert.equal(m.harness_error, true);
  assert.equal(m.failure_reason, 'rate_limited');
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.meta.incomplete_reason, 'rate_limited');
  assert.equal(s.meta.complete, false);
});

test('a run whose trace is missing is a harness error (REQ-011)', { skip }, () => {
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1'], { traceFile: TRACE, noTrace: true });
  assert.equal(res.status, 5, res.stdout + res.stderr);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'a-0.json'), 'utf8'));
  assert.equal(m.harness_error, true);
  assert.equal(m.tokens.source, 'unavailable');
});

import { loadSchema, validate } from '../lib/schema.mjs';

test('runner writes schema-valid run metrics with every grader block and summary aggregates (task 2.14)', { skip }, () => {
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1'], { traceFile: TRACE, workspaceFrom: fixedWorkspace() });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'a-0.json'), 'utf8'));
  assert.deepEqual(validate(loadSchema('run-metrics'), m), []);
  assert.equal(m.phases.order_ok, true);
  assert.equal(m.session_start.exit_code, 126);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.cases.a.phase_order.mean, 1);
  assert.ok(s.cases.a.per_phase_tokens['ai-flow:implementer']);
});

// Task 3.2 (REQ-014 S2/S4, re-scoped: the cap is optional and only applies when --max-cost-usd is given).
test('[cap-abort] a CLI cap abort (partial, exit 2) marks the suite incomplete with the spend so far; exit 2', { skip }, () => {
  const { res, out, argv } = runWithStub(['--case', 'a', '--runs', '2', '--max-cost-usd', '0.05'], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), partial: true, exitCode: 2, costUsd: 0.3, runsProduced: 1 });
  assert.equal(res.status, 2, res.stdout + res.stderr);
  assert.equal(argv.length, 1);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.meta.complete, false);
  assert.equal(s.meta.incomplete_reason, 'cost_cap');
  assert.equal(s.meta.total_cost_usd, 0.3);
  assert.equal(s.meta.cap_usd, 0.05);
  assert.equal(s.cases.a.n, 1, 'at most one run past the cap at -j 1');
  assert.match(res.stderr, /cost cap/i);
});

test('with a cap and -j > 1 the runner warns that the overrun can exceed one run', { skip }, () => {
  const { res } = runWithStub(['--case', 'a', '--runs', '1', '--max-cost-usd', '5', '-j', '2'], { traceFile: TRACE, workspaceFrom: fixedWorkspace() });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stderr, /warning: .*-j 2.*overrun/i);
});

// Task 3.3 (REQ-013 S1-S2, D11 re-scoped: no USD cap by default; U1 gate).
/** Both sonnet gate baselines (v3.4.0 and the config.gateBaseline.sonnet file) as minimal fixtures. */
function seedGateBaselines(dir) {
  for (const f of ['v3.4.0-sonnet.json', 'v4.0.0-alpha.2-sonnet.json']) fs.copyFileSync(path.join(HERE, 'fixtures', 'aggregate', 'baseline-min.json'), path.join(dir, f));
}

function dry(args, env = {}) {
  const r = spawnSync('bash', [RUN_SH, ...args, '--dry-run'], { encoding: 'utf8', env: { ...process.env, AIFLOW_EVAL_CLAUDE_BIN: '/bin/false', ...env } });
  return { r, plan: r.status === 0 ? JSON.parse(r.stdout) : null };
}

test('--dry-run prints the plan and spawns nothing; no flags = full suite (5 cases), runs 3, no cap, sonnet', () => {
  const env = { ...process.env };
  delete env.AIFLOW_EVAL_MODEL;
  const r = spawnSync('bash', [RUN_SH, '--dry-run'], { encoding: 'utf8', env: { ...env, AIFLOW_EVAL_CLAUDE_BIN: '/bin/false' } });
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.deepEqual(plan.cases, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(plan.runs, 3);
  assert.equal(plan.cap_usd, null);
  assert.equal(plan.model, 'sonnet');
  assert.equal(plan.subset, false);
  assert.ok(!plan.args.includes('--case') && !plan.args.includes('--max-cost-usd'));
});

test('--tag smoke selects the smoke cases with runs 1 and no cap', () => {
  const { r, plan } = dry(['--tag', 'smoke']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(plan.cases, ['a', 'd']);
  assert.equal(plan.runs, 1);
  assert.equal(plan.cap_usd, null);
  assert.equal(plan.subset, true);
  assert.ok(plan.args.join(' ').includes('--tag smoke'));
});

test('the model is sonnet unless AIFLOW_EVAL_MODEL or --model says otherwise', () => {
  assert.equal(dry([], { AIFLOW_EVAL_MODEL: 'opus' }).plan.model, 'opus');
  assert.equal(dry(['--model', 'haiku'], { AIFLOW_EVAL_MODEL: 'opus' }).plan.model, 'haiku');
});

test('--gate = full suite, runs 3, harness-error retries on, compared against baselines/v3.4.0-<model>.json for a model without its own gateBaseline key', () => {
  const dir = tmp('aiflow-bl-');
  fs.copyFileSync(path.join(HERE, 'fixtures', 'aggregate', 'baseline-min.json'), path.join(dir, 'v3.4.0-opus.json'));
  const { r, plan } = dry(['--gate'], { AIFLOW_EVAL_BASELINES_DIR: dir, AIFLOW_EVAL_MODEL: 'opus' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(plan.cases, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(plan.runs, 3);
  assert.equal(plan.retry_harness_errors, 2);
  assert.equal(plan.compare, path.join(dir, 'v3.4.0-opus.json'));
});

test('--gate without the model baseline refuses before spawning anything (exit 3)', () => {
  const dir = tmp('aiflow-bl-');
  const { res, argv } = runWithStub(['--gate', '--model', 'opus'], {}, { AIFLOW_EVAL_BASELINES_DIR: dir });
  assert.equal(res.status, 3, res.stdout + res.stderr);
  assert.equal(argv.length, 0);
  assert.match(res.stderr, /v3\.4\.0-opus\.json/);
});

test('S2: --case a --case d --runs 1 runs only those cases and marks the suite partial (cases_run [a,d])', { skip }, () => {
  const { res, out, argv } = runWithStub(['--case', 'a', '--case', 'd', '--runs', '1'], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), caseNames: { a: 'a-e2e-bugfix-slugify', d: 'd-phase-apply-seeded' } });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  // The CLI honours one --case glob only; several cases go as ORed case-<id> tags (P4.6 finding).
  assert.ok(argv[0].join(' ').includes('--tag case-a --tag case-d'), argv[0].join(' '));
  assert.ok(!argv[0].includes('--case'));
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.deepEqual(s.meta.cases_run, ['a', 'd']);
  assert.equal(s.meta.subset, true);
});

test('--compare runs compare.mjs after the summary and exits 1 on a regression', { skip }, () => {
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1', '--compare', path.join(HERE, 'fixtures', 'aggregate', 'baseline-min.json')], { traceFile: TRACE, workspaceFrom: fixedWorkspace() });
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /tokens_total .* regression/);
  assert.ok(fs.existsSync(path.join(out, 'compare.json')));
});

// Task 3.4 (REQ-013 S3): a scaffold failure in one case is a harness error; other cases still run; exit 5.
test('S3: scaffold failure for case b is recorded as harness_error, case a is graded, runner exits 5', { skip }, () => {
  const { res, out } = runWithStub(['--case', 'a', '--case', 'b', '--runs', '1'], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), caseNames: { a: 'a-e2e-bugfix-slugify', b: 'b-e2e-feature-truncate-words' }, caseErrors: { b: 'scaffold failed: exit 1' } });
  assert.equal(res.status, 5, res.stdout + res.stderr);
  const b = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'b-0.json'), 'utf8'));
  assert.equal(b.harness_error, true);
  assert.equal(b.failure_reason, 'scaffold_failed');
  const a = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'a-0.json'), 'utf8'));
  assert.equal(a.harness_error, false);
  assert.equal(a.outcome.pass, true);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.cases.b.harness_errors, 1);
  assert.equal(s.cases.b.n, 0);
});

// Task 3.5 (U5, REQ-016 S1; user decision: rate-limited runs are never retried).
const AB = { a: 'a-e2e-bugfix-slugify', b: 'b-e2e-feature-truncate-words' };

test('a harness error in (b) run 2 is retried as `--case b-* --runs 1`; summary n=3, harness_errors_retried=1', { skip }, () => {
  const { res, out, argv } = runWithStub(['--case', 'b', '--runs', '3', '--retry-harness-errors', '2'], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), caseNames: AB, caseErrors: { b: [null, 'API Error: 500 Internal server error', null] }, costUsd: 0.5 });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.equal(argv.length, 2);
  const retry = argv[1].join(' ');
  assert.ok(retry.includes('--case b-*') && retry.includes('--runs 1'), retry);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.cases.b.n, 3);
  assert.equal(s.cases.b.harness_errors, 0);
  assert.equal(s.cases.b.harness_errors_retried, 1);
  assert.equal(s.meta.total_cost_usd, 2, 'retries count toward cumulative spend');
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'runs', 'b-1.json'), 'utf8')).retried, 1);
});

test('a harness error that persists after 2 retries leaves n=2 and exits 5', { skip }, () => {
  const { res, out, argv } = runWithStub(['--case', 'b', '--runs', '3', '--retry-harness-errors', '2'], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), caseNames: AB, caseErrors: { b: [null, 'API Error: 500', null, 'API Error: 500', 'API Error: 500'] } });
  assert.equal(res.status, 5, res.stdout + res.stderr);
  assert.equal(argv.length, 3);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.cases.b.n, 2);
  assert.equal(s.cases.b.harness_errors, 1);
});

test('rate-limited runs are never retried, even with retries on', { skip }, () => {
  const { res, argv } = runWithStub(['--case', 'b', '--runs', '2', '--retry-harness-errors', '2'], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), caseNames: AB, caseErrors: { b: [null, 'API Error: 429 rate limit exceeded'] } });
  assert.equal(res.status, 5, res.stdout + res.stderr);
  assert.equal(argv.length, 1);
});

test('with a cap, each retry gets the remaining budget; no retry starts once the cap is spent', { skip }, () => {
  const { argv } = runWithStub(['--case', 'b', '--runs', '2', '--retry-harness-errors', '2', '--max-cost-usd', '1.5'], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), caseNames: AB, caseErrors: { b: ['API Error: 500', null, 'API Error: 500', null] }, costUsd: 0.5 });
  assert.equal(argv.length, 2, 'first invocation spends 1.0; one retry (0.5 left) then the cap is spent');
  assert.ok(argv[1].join(' ').includes('--max-cost-usd 0.5'));
});

// --resume <results-dir> (Batch 5, user decision 2026-10-18): complete a suite stopped by the rate limit by
// re-running only the missing or harness-error case x run slots; clean prior runs are kept as they are.
test('--resume re-runs only the missing/harness-error slots of a rate-limited suite and merges the summary', { skip }, () => {
  const first = runWithStub(['--case', 'a', '--case', 'b', '--runs', '2'], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), caseNames: AB, caseErrors: { b: [null, 'API Error: 429 rate limit exceeded'] }, costUsd: 0.5 });
  assert.equal(first.res.status, 5, first.res.stdout + first.res.stderr);
  const prevA0 = JSON.parse(fs.readFileSync(path.join(first.out, 'runs', 'a-0.json'), 'utf8'));
  const { res, out, argv } = runWithStub(['--case', 'a', '--case', 'b', '--runs', '2', '--resume', first.out], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), caseNames: AB, costUsd: 0.5 });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.equal(argv.length, 1, 'one invocation, only for the case with a missing slot');
  const inv = argv[0].join(' ');
  assert.ok(inv.includes('--case b-*') && inv.includes('--runs 1'), inv);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'runs', 'a-0.json'), 'utf8')), prevA0, 'clean prior run kept verbatim');
  const b1 = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'b-1.json'), 'utf8'));
  assert.equal(b1.harness_error, false);
  assert.equal(b1.run_index, 1);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.meta.complete, true);
  assert.equal(s.meta.incomplete_reason, null);
  assert.deepEqual(s.meta.cases_run, ['a', 'b']);
  assert.equal(s.cases.a.n, 2);
  assert.equal(s.cases.b.n, 2);
  assert.equal(s.meta.total_cost_usd, 2.5, 'prior spend (4 runs x 0.5) + resumed spend (1 x 0.5)');
  assert.equal(s.meta.resumed_from, first.out);
});

test('--resume with nothing missing spawns no eval and rebuilds the summary', { skip }, () => {
  const first = runWithStub(['--case', 'a', '--runs', '1'], { traceFile: TRACE, workspaceFrom: fixedWorkspace(), costUsd: 0.5 });
  assert.equal(first.res.status, 0, first.res.stdout + first.res.stderr);
  const { res, out, argv } = runWithStub(['--case', 'a', '--runs', '1', '--resume', first.out], { traceFile: TRACE, workspaceFrom: fixedWorkspace() });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.equal(argv.length, 0);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.cases.a.n, 1);
  assert.equal(s.meta.total_cost_usd, 0.5);
});

test('--resume of a missing results dir refuses before spawning (exit 3)', () => {
  const { res, argv } = runWithStub(['--case', 'a', '--resume', path.join(os.tmpdir(), 'aiflow-no-such-results')]);
  assert.equal(res.status, 3, res.stdout + res.stderr);
  assert.equal(argv.length, 0);
});

// Runner --promote (REQ-016, U5): retries on by default; a summary that fails the guards is refused (exit 7).
test('--promote turns harness-error retries on (dry run)', () => {
  const { plan } = dry(['--promote', 'v3.4.0', '--plugin-ref', 'v3.4.0']);
  assert.equal(plan.retry_harness_errors, 2);
  assert.equal(plan.promote, 'v3.4.0');
});

test('--promote on a subset run is refused with exit 7; the summary keeps session_start (intended from --session-start)', { skip }, () => {
  const ssFile = path.join(tmp('aiflow-ss-'), 'ss.json');
  fs.writeFileSync(ssFile, JSON.stringify({ intended: { hook_tokens: 1839, hook_chars: 6800, always_on_tokens: 1832, method: 'first-turn input delta' } }));
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1', '--plugin-ref', 'v3.4.0', '--promote', 'v3.4.0', '--session-start', ssFile, '--skip-nested-canary'], { traceFile: TRACE, workspaceFrom: fixedWorkspace() }, { AIFLOW_EVAL_BASELINES_DIR: tmp('aiflow-bl-') });
  assert.equal(res.status, 7, res.stdout + res.stderr);
  assert.match(res.stderr, /warning: --skip-nested-canary/);
  assert.match(res.stderr, /promote refused: .*partial/);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.session_start.as_shipped.exit_code, 126);
  assert.equal(s.session_start.intended.hook_tokens, 1839);
});

// Task 4.1: the runner runs the full preflight before spawning anything; utilization is recorded and only warns.
test('the runner runs preflight first: an old claude CLI exits 3 before any eval invocation', () => {
  const { res, argv } = runWithStub(['--case', 'a', '--runs', '1'], { claudeVersion: '2.1.100 (Claude Code)' });
  assert.equal(res.status, 3, res.stdout + res.stderr);
  assert.equal(argv.length, 0, 'nothing spawned');
  assert.match(res.stderr, /preflight: FAIL claude: .*2\.1\.301/);
});

test('rate_limit_event utilization from run traces lands in meta.rate_limit and warns when high (never fails)', { skip }, () => {
  const trace = path.join(tmp('aiflow-rl-'), 'trace.jsonl');
  const event = { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.91, resetsAt: 1790000000 } };
  fs.writeFileSync(trace, JSON.stringify(event) + '\n' + fs.readFileSync(TRACE, 'utf8'));
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1'], { traceFile: trace, workspaceFrom: fixedWorkspace() });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.meta.rate_limit.seven_day.utilization, 0.91);
  assert.match(res.stderr, /seven_day 91%/);
});

// Task 4.2 / D10: --promote measures SessionStart automatically; --session-start <file> stays an optional override.
test('--promote without --session-start runs measure-session-start and records intended in the summary', { skip }, () => {
  const scenario = {
    traceFile: TRACE, workspaceFrom: fixedWorkspace(),
    firstTurnInputs: { 'as-shipped': 13061, full: 14900, 'no-hooks': 13061, empty: 11229 },
    hookResponses: { 'as-shipped': { outcome: 'error', exit_code: 126, stdout: '' } },
  };
  const { res, out, argv } = runWithStub(['--case', 'a', '--runs', '1', '--plugin-ref', 'v3.4.0', '--promote', 'v3.4.0', '--skip-nested-canary'], scenario, { AIFLOW_EVAL_BASELINES_DIR: tmp('aiflow-bl-') });
  assert.equal(res.status, 7, res.stdout + res.stderr);
  assert.equal(argv.filter((a) => ['as-shipped', 'full', 'no-hooks', 'empty'].includes(path.basename(a[2]))).length, 4);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(s.session_start.intended.hook_tokens, 1839);
  assert.equal(s.session_start.intended.always_on_tokens, 1832);
  assert.ok(fs.existsSync(path.join(out, 'session-start.json')));
  // B2b REQ-009 S1: the full measurement is persisted in the summary, its cost apart from the suite total.
  assert.equal(s.session_start.measured.as_shipped.input_delta_tokens, 0);
  assert.deepEqual(s.session_start.measured.first_turn_input_tokens, scenario.firstTurnInputs);
  assert.equal(typeof s.meta.session_start_cost_usd, 'number');
});

test('--case plus --tag is resolved locally (AND) and sent as the matching single case', () => {
  const { r, plan } = dry(['--case', 'a', '--case', 'b', '--tag', 'smoke']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(plan.cases, ['a']);
  assert.ok(plan.args.join(' ').includes('--case a-*'), plan.args.join(' '));
  assert.ok(!plan.args.includes('--tag'));
});

test('every committed case carries its case-<id> tag (multi-case selection relies on it)', async () => {
  const { discover } = await import('../lib/discover.mjs');
  for (const c of discover(path.join(EVALS_DIR, '..'))) assert.ok((c.data.tags ?? []).includes(`case-${c.id}`), c.name);
});

// B2b Task 0.3 (REQ-001 S1/S4, REQ-016 S1, REQ-020 S1): the runner retains a filtered, scrubbed nested bundle.
const MINI = path.join(HERE, 'fixtures', 'nested', 'mini-tdd');
const nestedScenario = () => ({ traceFile: path.join(MINI, 'trace.jsonl'), workspaceFrom: fixedWorkspace(), nested: { transcriptsDir: MINI, sessionId: 's-mini' } });

test('stub nested scenario: the runner retains results/<ts>/traces/a-0/subagents/*.meta.json (tracer, REQ-001)', { skip }, () => {
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1', '--plugin-ref', 'v3.4.0'], nestedScenario());
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const sub = path.join(out, 'traces', 'a-0', 'subagents');
  assert.deepEqual(fs.readdirSync(sub).filter((f) => f.endsWith('.meta.json')).sort(), ['agent-aimpl.meta.json', 'agent-aorch.meta.json']);
});

test('the retained bundle holds trace, user/assistant-only transcripts, meta, mock calls and capture.json; the kept dir is gone; no email or host path survives (REQ-001 S1/S4, REQ-016 S1, REQ-020 S1)', { skip }, () => {
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1', '--plugin-ref', 'v3.4.0'], nestedScenario());
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const dir = path.join(out, 'traces', 'a-0');
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort();
  assert.deepEqual(files, ['capture.json', 'subagents/agent-aimpl.jsonl', 'subagents/agent-aimpl.meta.json', 'subagents/agent-aorch.jsonl', 'subagents/agent-aorch.meta.json', 'trace.jsonl']);
  for (const f of files.filter((x) => x.endsWith('.jsonl') && x.startsWith('subagents/'))) {
    const types = fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l).type);
    assert.ok(types.every((t) => t === 'user' || t === 'assistant'), `${f}: ${types}`);
  }
  const all = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  for (const needle of ['session_context', '@example.invalid', '/Use' + 'rs/']) assert.ok(!all.includes(needle), `bundle contains ${needle}`);
  const capture = JSON.parse(fs.readFileSync(path.join(dir, 'capture.json'), 'utf8'));
  assert.equal(capture.status, 'complete');
  const m = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'a-0.json'), 'utf8'));
  assert.equal(m.nested_capture.status, 'complete');
  assert.equal(m.tdd.applicable, true, m.tdd.reason);
  assert.equal(fs.existsSync(m.artifacts_dir.kept_dir), false, 'kept temp dir removed');
});

test('grading the scrubbed bundle equals the in-run grading (scrub keeps in-run paths intact)', { skip }, async () => {
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1', '--plugin-ref', 'v3.4.0'], nestedScenario());
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const { analyzeTrace } = await import('../analyze.mjs');
  const { loadBundle } = await import('../lib/nested.mjs');
  const dir = path.join(out, 'traces', 'a-0');
  const a = analyzeTrace(fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8'), { caseName: 'a-e2e-bugfix-slugify', bundle: loadBundle(dir) });
  const m = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'a-0.json'), 'utf8'));
  for (const k of ['tdd', 'tool_use', 'artifacts', 'nested_capture']) assert.deepEqual(a[k], m[k], k);
});

// B2b Task 3.5 (REQ-013 S2, design D8): the --gate baseline comes from config.gateBaseline.
const withGateBaseline = (gateBaseline) => {
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'config.json'), 'utf8'));
  const file = path.join(tmp('aiflow-cfg-'), 'config.json');
  fs.writeFileSync(file, JSON.stringify({ ...cfg, gateBaseline }));
  return file;
};

test('--gate resolves its baseline from config.gateBaseline, not a hard-coded name (tracer, REQ-013)', () => {
  const dir = tmp('aiflow-bl-');
  fs.copyFileSync(path.join(HERE, 'fixtures', 'aggregate', 'baseline-min.json'), path.join(dir, 'other-sonnet.json'));
  const { r, plan } = dry(['--gate'], { AIFLOW_EVAL_BASELINES_DIR: dir, AIFLOW_EVAL_MODEL: 'sonnet', AIFLOW_EVAL_CONFIG: withGateBaseline({ default: 'other-{model}.json' }) });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(plan.compare, path.join(dir, 'other-sonnet.json'));
});

test('--gate: a model key beats the default; --compare overrides both (REQ-013 S2)', () => {
  const dir = tmp('aiflow-bl-');
  for (const f of ['v4-sonnet.json', 'v3.4.0-sonnet.json']) fs.copyFileSync(path.join(HERE, 'fixtures', 'aggregate', 'baseline-min.json'), path.join(dir, f));
  const env = { AIFLOW_EVAL_BASELINES_DIR: dir, AIFLOW_EVAL_MODEL: 'sonnet', AIFLOW_EVAL_CONFIG: withGateBaseline({ sonnet: 'v4-sonnet.json', default: 'v3.4.0-{model}.json' }) };
  assert.equal(dry(['--gate'], env).plan.compare, path.join(dir, 'v4-sonnet.json'));
  const explicit = path.join(dir, 'v3.4.0-sonnet.json');
  assert.equal(dry(['--gate', '--compare', explicit], env).plan.compare, explicit);
});

test('--gate whose configured baseline file is missing exits 3 naming it', () => {
  const { r } = dry(['--gate'], { AIFLOW_EVAL_BASELINES_DIR: tmp('aiflow-bl-'), AIFLOW_EVAL_MODEL: 'sonnet', AIFLOW_EVAL_CONFIG: withGateBaseline({ default: 'nope-{model}.json' }) });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /baseline not found: .*nope-sonnet\.json/);
});

test('--allow-env-mismatch is accepted and reaches the plan (needed when the CLI differs from the baseline env)', () => {
  const dir = tmp('aiflow-bl-');
  seedGateBaselines(dir);
  const { r, plan } = dry(['--gate', '--allow-env-mismatch'], { AIFLOW_EVAL_BASELINES_DIR: dir, AIFLOW_EVAL_MODEL: 'sonnet' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(plan.allow_env_mismatch, true);
});

// B2b Task 3.6 (design D9): --gate / --promote run the nested canary after preflight; --skip-nested-canary skips it.
test('--gate with a CLI that leaves no subagent transcripts stops at the nested canary after one retry: exit 3 with guidance, nothing else spawned', () => {
  const dir = tmp('aiflow-bl-');
  seedGateBaselines(dir);
  const { res, argv } = runWithStub(['--gate'], { traceFile: TRACE }, { AIFLOW_EVAL_BASELINES_DIR: dir });
  assert.equal(res.status, 3, res.stdout + res.stderr);
  assert.equal(argv.length, 2, 'only the canary ran (once, then one retry)');
  assert.match(res.stderr, /preflight: FAIL nested-canary: nested capture canary failed after 2 attempts: attempt 1: no subagent transcripts[^;]*; attempt 2: no subagent transcripts/);
  assert.match(res.stderr, /--skip-nested-canary/);
});

test('--skip-nested-canary is accepted and reaches the plan', () => {
  const dir = tmp('aiflow-bl-');
  seedGateBaselines(dir);
  assert.equal(dry(['--gate', '--skip-nested-canary'], { AIFLOW_EVAL_BASELINES_DIR: dir, AIFLOW_EVAL_MODEL: 'sonnet' }).plan.skip_nested_canary, true);
});

// B2b Task 4.1 (REQ-015 S1-S3, REQ-020 S1): end-to-end stub integration over the delegated-e2e fixture.
const E2E_FIX = path.join(HERE, 'fixtures', 'nested', 'delegated-e2e');
const e2eScenario = (transcriptsDir = E2E_FIX) => ({ traceFile: path.join(transcriptsDir, 'trace.jsonl'), workspaceFrom: fixedWorkspace(), nested: { transcriptsDir, sessionId: 's-e2e' } });
const NO_API_KEY = { ANTHROPIC_API_KEY: null };

test('e2e stub (delegated-e2e, no ANTHROPIC_API_KEY): capture complete, TDD applicable, every run has a capture status, summary counts it, meta.observability set, no kept dir left (REQ-015 S1/S3, REQ-020)', { skip }, () => {
  const { res, out } = runWithStub(['--case', 'a', '--runs', '2', '--plugin-ref', 'v3.4.0'], e2eScenario(), NO_API_KEY);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const runs = fs.readdirSync(path.join(out, 'runs')).map((f) => JSON.parse(fs.readFileSync(path.join(out, 'runs', f), 'utf8')));
  assert.equal(runs.length, 2);
  for (const m of runs) {
    assert.equal(m.nested_capture.status, 'complete', JSON.stringify(m.nested_capture));
    assert.equal(m.tdd.applicable, true, m.tdd.reason);
    assert.equal(fs.existsSync(m.artifacts_dir.kept_dir), false, 'kept temp dir removed');
  }
  const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.deepEqual(summary.cases.a.nested_capture, { complete: 2, partial: 0, failed: 0, not_applicable: 0 });
  assert.deepEqual(summary.meta.observability, { nested_capture: 'transcripts', analyzer: 'b2b' });
});

test('negative: e2e stub with the planner transcript deleted reports capture partial naming planner (REQ-015 S2)', { skip }, async () => {
  const { mutateBundle } = await import('./helpers.mjs');
  const { res, out } = runWithStub(['--case', 'a', '--runs', '1', '--plugin-ref', 'v3.4.0'], e2eScenario(mutateBundle(E2E_FIX, { drop: 'planner' })), NO_API_KEY);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'runs', 'a-0.json'), 'utf8'));
  assert.equal(m.nested_capture.status, 'partial');
  assert.match(m.nested_capture.reason, /planner/);
  const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(summary.cases.a.nested_capture.partial, 1);
});

// B2b Task 4.4 (REQ-013 S1): the sonnet gate compares with the promoted v4.0.0-alpha.2 baseline by default.
test('--gate --model sonnet resolves compare to the committed baselines/v4.0.0-alpha.2-sonnet.json, which validates (REQ-013 S1)', async () => {
  const { plan, r } = dry(['--gate', '--model', 'sonnet']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(plan.compare, path.join(EVALS_DIR, 'baselines', 'v4.0.0-alpha.2-sonnet.json'));
  const { loadSchema, validate } = await import('../lib/schema.mjs');
  const b = JSON.parse(fs.readFileSync(plan.compare, 'utf8'));
  assert.deepEqual(validate(loadSchema('baseline'), b), []);
  assert.equal(b.meta.label, 'v4.0.0-alpha.2');
});
