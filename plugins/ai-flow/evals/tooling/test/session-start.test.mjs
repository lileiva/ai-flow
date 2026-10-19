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
