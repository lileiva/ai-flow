// Task 4.2 (REQ-012 S1-S2 as amended by U3; design D10): SessionStart cost measured on temp plugin copies ($0, stub CLI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './helpers.mjs';
import { PLUGIN_DIR } from '../lib/paths.mjs';
import { buildVariants, measureSessionStart, VARIANTS } from '../measure-session-start.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUB = path.join(HERE, 'fixtures', 'stub-claude.mjs');

function stubEnv(scenarioObj) {
  const dir = tmpDir('aiflow-ss-stub-');
  const file = path.join(dir, 'scenario.json');
  fs.writeFileSync(file, JSON.stringify(scenarioObj));
  const log = path.join(dir, 'argv.jsonl');
  return { env: { ...process.env, AIFLOW_EVAL_CLAUDE_BIN: STUB, AIFLOW_STUB_SCENARIO: file, AIFLOW_STUB_LOG: log }, log };
}

const isExec = (f) => (fs.statSync(f).mode & 0o111) !== 0;

test('tracer: buildVariants makes as-shipped, full (+x hook), no-hooks and empty plugin copies, each with a 1-turn probe case', () => {
  const root = tmpDir('aiflow-ss-variants-');
  const dirs = buildVariants(PLUGIN_DIR, root);
  assert.deepEqual(Object.keys(dirs), VARIANTS);
  assert.equal(isExec(path.join(dirs['as-shipped'], 'hooks', 'run-hook.cmd')), isExec(path.join(PLUGIN_DIR, 'hooks', 'run-hook.cmd')));
  assert.equal(isExec(path.join(dirs.full, 'hooks', 'run-hook.cmd')), true);
  assert.equal(fs.existsSync(path.join(dirs['no-hooks'], 'hooks')), false);
  assert.ok(fs.existsSync(path.join(dirs['no-hooks'], 'skills')));
  assert.deepEqual(fs.readdirSync(dirs.empty).sort(), ['.claude-plugin', 'evals']);
  for (const d of Object.values(dirs)) {
    assert.ok(fs.existsSync(path.join(d, 'evals', 'ss-probe', 'prompt.md')), d);
    assert.ok(fs.existsSync(path.join(d, 'evals', 'ss-probe', 'graders', 'replied.md')), d);
    assert.equal(fs.existsSync(path.join(d, 'evals', 'cases')), false, 'the ai-flow suite is never copied');
  }
});

test('tracer: measureSessionStart spawns one 1-run eval per variant', async () => {
  const { env, log } = stubEnv({ firstTurnInputs: Object.fromEntries(VARIANTS.map((v) => [v, 100])) });
  await measureSessionStart({ pluginRef: 'v3.4.0', model: 'sonnet', env });
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(calls.length, VARIANTS.length);
  for (const argv of calls) {
    for (const f of ['plugin', 'eval', '--runs', '1', '--ablation', 'none', '--trust-plugin', '--no-publish', '--keep-temp', '--model', 'sonnet']) assert.ok(argv.includes(f), `${f} missing in ${argv}`);
  }
  assert.deepEqual(calls.map((a) => path.basename(a[2])).sort(), [...VARIANTS].sort());
});

// Behavior: the stub answers each variant (keyed by plugin dir basename) with a scripted first-turn input size.
import { execFileSync } from 'node:child_process';
import { hookChars } from '../measure-session-start.mjs';
import { REPO_ROOT } from '../lib/paths.mjs';

const HOOK_126 = { outcome: 'error', exit_code: 126, stdout: '', stderr: 'run-hook.cmd: Permission denied' };
const LIVE_LIKE = {
  firstTurnInputs: { 'as-shipped': 13061, full: 14900, 'no-hooks': 13061, empty: 11229 },
  hookResponses: { 'as-shipped': HOOK_126, full: { outcome: 'success', exit_code: 0, stdout: 'x'.repeat(6800) } },
};

test('S1: inputs 14900/13061/11229 give hook_tokens 1839 and always_on 1832; as-shipped injects 0 with exit 126', async () => {
  const { env } = stubEnv(LIVE_LIKE);
  const r = await measureSessionStart({ pluginRef: 'v3.4.0', model: 'sonnet', env });
  assert.equal(r.intended.hook_tokens, 1839);
  assert.equal(r.intended.always_on_tokens, 1832);
  assert.match(r.intended.method, /first-turn input/);
  assert.equal(r.as_shipped.exit_code, 126);
  assert.equal(r.as_shipped.hook_outcome, 'error');
  assert.equal(r.as_shipped.injected_tokens, 0);
  assert.equal(r.as_shipped.input_delta_tokens, 0);
  assert.deepEqual(r.first_turn_input_tokens, LIVE_LIKE.firstTurnInputs);
  assert.equal(r.plugin_ref, 'v3.4.0');
  assert.equal(r.model, 'sonnet');
});

test('hook_chars comes from running hooks/session-start directly (about 6.8k chars at v3.4.0)', async () => {
  const { env } = stubEnv(LIVE_LIKE);
  const r = await measureSessionStart({ pluginRef: 'v3.4.0', model: 'sonnet', env });
  assert.ok(r.intended.hook_chars > 5000 && r.intended.hook_chars < 9000, `hook_chars ${r.intended.hook_chars}`);
});

test('S2: a shortened hook in a temp copy gives a lower hook_chars', () => {
  const copy = path.join(tmpDir('aiflow-ss-short-'), 'plugin');
  fs.cpSync(PLUGIN_DIR, copy, { recursive: true, filter: (src) => !src.includes(`${path.sep}evals${path.sep}`) });
  const full = hookChars(copy);
  const skill = path.join(copy, 'skills', 'using-ai-flow', 'SKILL.md');
  fs.writeFileSync(skill, fs.readFileSync(skill, 'utf8').slice(0, 500));
  assert.ok(hookChars(copy) < full, `${hookChars(copy)} !< ${full}`);
});

test('U3: measuring never changes the source run-hook.cmd mode', async () => {
  const before = execFileSync('git', ['ls-files', '-s', 'plugins/ai-flow/hooks/run-hook.cmd'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const modeBefore = fs.statSync(path.join(PLUGIN_DIR, 'hooks', 'run-hook.cmd')).mode;
  const { env } = stubEnv(LIVE_LIKE);
  await measureSessionStart({ pluginRef: 'v3.4.0', model: 'sonnet', env });
  assert.equal(fs.statSync(path.join(PLUGIN_DIR, 'hooks', 'run-hook.cmd')).mode, modeBefore);
  assert.equal(execFileSync('git', ['ls-files', '-s', 'plugins/ai-flow/hooks/run-hook.cmd'], { cwd: REPO_ROOT, encoding: 'utf8' }), before);
});

test('a variant without a trace makes the measurement fail loudly (no guessed numbers)', async () => {
  const { env } = stubEnv({ ...LIVE_LIKE, noTrace: true });
  await assert.rejects(measureSessionStart({ pluginRef: 'v3.4.0', model: 'sonnet', env }), /no trace/);
});

// P4.8 regression: the live sonnet measurement of 2026-10-18 (claude 2.1.302, plugin-ref v3.4.0), fed back as stub inputs.
const LIVE_2026_10_18 = {
  firstTurnInputs: { 'as-shipped': 12503, full: 15280, 'no-hooks': 12503, empty: 10583 },
  hookResponses: { 'as-shipped': HOOK_126, full: { outcome: 'success', exit_code: 0, stdout: 'x'.repeat(7227) } },
};

test('[regression] live P4.8 numbers: hook_tokens 2777, always_on 1920, as-shipped 0 tokens with exit 126', async () => {
  const { env } = stubEnv(LIVE_2026_10_18);
  const r = await measureSessionStart({ pluginRef: 'v3.4.0', model: 'sonnet', env });
  assert.equal(r.intended.hook_tokens, 2777);
  assert.equal(r.intended.always_on_tokens, 1920);
  assert.equal(r.as_shipped.exit_code, 126);
  assert.equal(r.as_shipped.injected_tokens, 0);
  assert.equal(r.as_shipped.input_delta_tokens, 0);
});

test('the full variant records the hook stdout chars seen by Claude Code (cross-check for hook_chars)', async () => {
  const { env } = stubEnv(LIVE_2026_10_18);
  const r = await measureSessionStart({ pluginRef: 'v3.4.0', model: 'sonnet', env });
  assert.equal(r.full_hook.stdout_chars, 7227);
});

// B2b Task 3.3 (REQ-009 S1-S3, design D11): the SessionStart measurement is persisted with gate results.
import { resolveSessionStart } from '../run.mjs';
import { summarize as summarizeRuns } from '../summarize.mjs';
import { tmpDir as b2bTmp } from './helpers.mjs';

const MEASURED = {
  plugin_ref: '8029d9b', model: 'sonnet', claude_version: '2.1.309', date: '2026-10-23T00:00:00Z',
  first_turn_input_tokens: { 'as-shipped': 15951, full: 15951, 'no-hooks': 13061, empty: 11229 },
  as_shipped: { hook_outcome: 'success', exit_code: 0, injected_tokens: 2000, input_delta_tokens: 2890 },
  intended: { hook_tokens: 2890, hook_chars: 9000, always_on_tokens: 1832, method: 'first-turn input delta on temp plugin copies' },
  cost_usd: 0.13,
};
const counting = (impl) => { const f = async (...a) => { f.calls++; return impl(...a); }; f.calls = 0; return f; };

test('--gate measures SessionStart and writes results/<ts>/session-start.json (tracer, REQ-009)', async () => {
  const outDir = b2bTmp();
  const measure = counting(() => MEASURED);
  const r = await resolveSessionStart({ gate: true, pluginRef: '8029d9b', model: 'sonnet' }, { outDir, measure, log: () => {} });
  assert.equal(measure.calls, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outDir, 'session-start.json'), 'utf8')), MEASURED);
  assert.equal(r.measured.as_shipped.input_delta_tokens, 2890);
});

test('the summary carries session_start.measured (input_delta_tokens, first-turn inputs, method, CLI, ref, cost) and meta.session_start_cost_usd stays apart from total cost (REQ-009 S1)', async () => {
  const r = await resolveSessionStart({ gate: true, pluginRef: '8029d9b', model: 'sonnet' }, { outDir: b2bTmp(), measure: async () => MEASURED, log: () => {} });
  const META = { plugin_version: '4.0.0-alpha.2', plugin_ref: '8029d9b', plugin_sha: 'x', claude_version: '2.1.309', model: 'sonnet', judge_model: 'haiku', date: 'd', runs_per_case: 1, cap_usd: null, cases_run: ['a'], complete: true, incomplete_reason: null, total_cost_usd: 1, session_start_cost_usd: r.cost_usd };
  const s = summarizeRuns([{ case: 'a', run_index: 0, harness_error: false, tokens: { total: 1 }, outcome: { pass: true }, cli: { costUsd: 1, durationSeconds: 1 }, tdd: { applicable: false }, session_start: { hook_outcome: 'success', exit_code: 0, injected_tokens_est: 2000 } }], META, { sessionStartIntended: r.intended, sessionStartMeasured: r.measured });
  const m = s.session_start.measured;
  assert.equal(m.as_shipped.input_delta_tokens, 2890);
  assert.deepEqual(m.first_turn_input_tokens, MEASURED.first_turn_input_tokens);
  assert.equal(m.method, MEASURED.intended.method);
  assert.equal(m.claude_version, '2.1.309');
  assert.equal(m.plugin_ref, '8029d9b');
  assert.equal(m.cost_usd, 0.13);
  assert.equal(s.meta.session_start_cost_usd, 0.13);
  assert.equal(s.meta.total_cost_usd, 1);
  assert.equal(s.session_start.as_shipped.injected_tokens_est_chars4, 2000, 'the chars/4 field is labelled an estimate');
  assert.equal(s.session_start.as_shipped.injected_tokens, 2000, 'legacy key kept');
});

test('--session-start <file> is copied unchanged and nothing is re-measured (REQ-009 S2)', async () => {
  const outDir = b2bTmp();
  const file = path.join(b2bTmp(), 'm.json');
  fs.writeFileSync(file, JSON.stringify(MEASURED, null, 1));
  const measure = counting(() => { throw new Error('must not run'); });
  const r = await resolveSessionStart({ gate: true, sessionStart: file }, { outDir, measure, log: () => {} });
  assert.equal(measure.calls, 0);
  assert.equal(fs.readFileSync(path.join(outDir, 'session-start.json'), 'utf8'), fs.readFileSync(file, 'utf8'));
  assert.equal(r.measured.as_shipped.input_delta_tokens, 2890);
  assert.deepEqual(r.intended, MEASURED.intended);
});

test('a failing measurement under --gate is recorded as measured {error} with a warning, never silently absent (REQ-009 S3)', async () => {
  const logs = [];
  const r = await resolveSessionStart({ gate: true }, { outDir: b2bTmp(), measure: async () => { throw new Error('variant full left no trace'); }, log: (l) => logs.push(l) });
  assert.match(r.measured.error, /variant full left no trace/);
  assert.equal(r.intended, null);
  assert.ok(logs.some((l) => /warning: SessionStart measurement failed/.test(l)));
});

test('input_delta_tokens outside the informational band [2360, 3295] prints a warning only (R5)', async () => {
  const logs = [];
  await resolveSessionStart({ gate: true }, { outDir: b2bTmp(), measure: async () => ({ ...MEASURED, as_shipped: { ...MEASURED.as_shipped, input_delta_tokens: 4000 } }), log: (l) => logs.push(l) });
  assert.ok(logs.some((l) => /input_delta_tokens 4000 outside the B2 band \[2360, 3295\]/.test(l)));
  const quiet = [];
  await resolveSessionStart({ gate: true }, { outDir: b2bTmp(), measure: async () => MEASURED, log: (l) => quiet.push(l) });
  assert.deepEqual(quiet, []);
});

test('without --gate or --promote nothing is measured', async () => {
  const measure = counting(() => MEASURED);
  assert.deepEqual(await resolveSessionStart({}, { outDir: b2bTmp(), measure, log: () => {} }), { intended: null, measured: null, cost_usd: null });
  assert.equal(measure.calls, 0);
});
