// Task 0.4 (D9, U2): the sandbox Node probe classifies live CLI outcomes (stub-tested, $0).
import { test } from 'node:test';
import { tmpDir } from './helpers.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeSandboxNode } from '../preflight.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUB = path.join(HERE, 'fixtures', 'stub-claude.mjs');
const PREFLIGHT = path.join(HERE, '..', 'preflight.mjs');

function scenario(obj) {
  const dir = tmpDir('aiflow-stub-');
  const file = path.join(dir, 'scenario.json');
  fs.writeFileSync(file, JSON.stringify(obj));
  return { file, log: path.join(dir, 'argv.jsonl') };
}

function stubEnv(sc) {
  return { ...process.env, AIFLOW_EVAL_CLAUDE_BIN: STUB, AIFLOW_STUB_SCENARIO: sc.file, AIFLOW_STUB_LOG: sc.log };
}

const OK_OUTPUT = 'v26.5.0\n11.17.0\n\n Test Files  1 passed (1)\n      Tests  3 passed (3)\n';
const NPM_UNREADABLE = "v26.5.0\nnode:internal/modules/cjs/loader:1573\nError: Cannot find module '/home/user/.nvm/versions/node/v26.5.0/bin/npm'\n";

test('probe reports ok with node version when node 26, npm and vitest all work in the sandbox', async () => {
  const sc = scenario({ bashResults: [OK_OUTPUT] });
  const r = await probeSandboxNode({ env: stubEnv(sc), strategy: { name: 'none' } });
  assert.equal(r.ok, true);
  assert.equal(r.node, 'v26.5.0');
  assert.equal(r.npm, '11.17.0');
  assert.equal(r.testsPassed, 3);
  const argv = JSON.parse(fs.readFileSync(sc.log, 'utf8').trim().split('\n')[0]);
  for (const flag of ['plugin', 'eval', '--model', 'haiku', '--runs', '1', '--ablation', 'none', '--scaffold', '--trust-plugin', '--no-publish', '--keep-temp', '--allow-tools', 'Bash', '--json']) {
    assert.ok(argv.includes(flag), `missing ${flag} in ${argv.join(' ')}`);
  }
});

test('probe reports npm-unreadable when npm cannot be loaded inside the sandbox', async () => {
  const sc = scenario({ bashResults: [NPM_UNREADABLE] });
  const r = await probeSandboxNode({ env: stubEnv(sc), strategy: { name: 'none' } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'npm-unreadable');
});

test('preflight --probe-node exits 3 with R1-R4 guidance on failure', () => {
  const sc = scenario({ bashResults: [NPM_UNREADABLE] });
  const res = spawnSync(process.execPath, [PREFLIGHT, '--probe-node', '--strategy', 'none'], { env: stubEnv(sc), encoding: 'utf8' });
  assert.equal(res.status, 3, res.stdout + res.stderr);
  const out = res.stdout + res.stderr;
  assert.match(out, /npm-unreadable/);
  for (const r of ['R1', 'R2', 'R3', 'R4']) assert.match(out, new RegExp(r));
});

// Task 4.1 (D9, D5, U2, U5): full preflight. Every failing check exits 3 with specific guidance; utilization only warns.
import { preflightChecks, latestRateLimit } from '../preflight.mjs';

function okInputs(over = {}) {
  const cache = tmpDir('aiflow-cache-');
  fs.mkdirSync(path.join(cache, 'textkit', 'node_modules'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'node26', 'bin'), { recursive: true });
  return { claudeVersion: '2.1.301 (Claude Code)', gitVersion: 'git version 2.52.0', nodeVersion: 'v26.5.0', cacheDir: cache,
    which: (bin) => bin === 'sandbox-exec', config: { node: { strategy: 'R1' } }, rateLimit: {}, ...over };
}

test('preflight passes when every check is satisfied', () => {
  const r = preflightChecks(okInputs());
  assert.equal(r.ok, true, JSON.stringify(r.failures));
  assert.deepEqual(r.failures, []);
});

const FAILING = [
  ['claude', { claudeVersion: '2.1.300 (Claude Code)' }, /claude 2\.1\.300 .*2\.1\.301/],
  ['claude', { claudeVersion: null }, /claude CLI not found/],
  ['git', { gitVersion: 'git version 2.30.9' }, /git 2\.30\.9 .*2\.31/],
  ['node', { nodeVersion: 'v22.11.0' }, /nvm use 26/],
  ['cache', { cacheDir: '/nonexistent/aiflow-cache' }, /prepare\.mjs/],
  ['sandbox', { which: () => false }, /sandbox-exec .*bwrap/],
  ['node-strategy', { config: {} }, /preflight\.mjs --probe-node/],
];
for (const [check, over, guidance] of FAILING) {
  test(`preflight fails the ${check} check with specific guidance (${JSON.stringify(over).slice(0, 60)})`, () => {
    const r = preflightChecks(okInputs(over));
    assert.equal(r.ok, false);
    const f = r.failures.find((x) => x.check === check);
    assert.ok(f, `no ${check} failure in ${JSON.stringify(r.failures)}`);
    assert.match(f.message, guidance);
  });
}

test('a missing node26 cache alone fails the cache check', () => {
  const inputs = okInputs();
  fs.rmSync(path.join(inputs.cacheDir, 'node26'), { recursive: true });
  const r = preflightChecks(inputs);
  assert.deepEqual(r.failures.map((f) => f.check), ['cache']);
  assert.match(r.failures[0].message, /node26/);
});

test('--unsafe-host-grading waives the sandbox check', () => {
  assert.equal(preflightChecks(okInputs({ which: () => false, unsafeHostGrading: true })).ok, true);
});

test('high subscription utilization only warns; it never fails preflight', () => {
  const r = preflightChecks(okInputs({ rateLimit: { seven_day: { utilization: 0.92, status: 'allowed_warning', resets_at: null } } }));
  assert.equal(r.ok, true);
  assert.match(r.warnings.join('\n'), /seven_day 92%/);
});

test('latestRateLimit reads meta.rate_limit from the newest results summary (null when there is none)', () => {
  const results = tmpDir('aiflow-results-');
  assert.equal(latestRateLimit(results), null);
  for (const [stamp, u] of [['2026-10-01T00-00-00-000Z', 0.5], ['2026-10-02T00-00-00-000Z', 0.9]]) {
    fs.mkdirSync(path.join(results, stamp));
    fs.writeFileSync(path.join(results, stamp, 'summary.json'), JSON.stringify({ meta: { rate_limit: { seven_day: { utilization: u } } } }));
  }
  assert.equal(latestRateLimit(results).seven_day.utilization, 0.9);
});

test('preflight (no flags) exits 3 when the claude CLI is too old and names the minimum', () => {
  const sc = scenario({ claudeVersion: '2.1.200 (Claude Code)' });
  const res = spawnSync(process.execPath, [PREFLIGHT], { env: stubEnv(sc), encoding: 'utf8' });
  assert.equal(res.status, 3, res.stdout + res.stderr);
  assert.match(res.stderr, /2\.1\.301/);
});

// B2b Task 3.6 (design D9): a nested-capture canary before a paid gate.
const PROBE3 = path.join(HERE, 'fixtures', 'nested', 'probe-depth3');
const E6 = 'mocks: memx: the harness answered 2 agent mock calls the trace does not show (the responder was reached other than through the mocked tools)';
const canaryScenario = (over = {}) => scenario({ traceFile: path.join(PROBE3, 'trace.jsonl'), nested: { transcriptsDir: PROBE3, sessionId: 's-probe' }, error: E6, ...over });

test('the nested canary runs the probe plugin through the CLI and reports check "nested-canary" (tracer, D9)', async () => {
  const { runNestedCanaryCheck } = await import('../preflight.mjs');
  const sc = canaryScenario();
  const r = await runNestedCanaryCheck({ env: stubEnv(sc) });
  assert.equal(r.check, 'nested-canary');
  assert.equal(r.ok, true, r.message);
  const argv = fs.readFileSync(sc.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(argv.length, 1);
  assert.deepEqual(argv[0].slice(0, 2), ['plugin', 'eval']);
  assert.equal(argv[0][argv[0].indexOf('--model') + 1], 'haiku');
});

test('the canary passes only with transcripts at depths 1, 2 and 3, the depth-3 Write merged, and W5 reconciled', async () => {
  const { nestedCanary } = await import('../preflight.mjs');
  const ok = await nestedCanary({ env: stubEnv(canaryScenario()) });
  assert.deepEqual({ ok: ok.ok, depths: ok.depths, leaf_write: ok.leaf_write, run_error_class: ok.run_error_class }, { ok: true, depths: [1, 2, 3], leaf_write: true, run_error_class: 'nested_mock_accounting' });
  const { mutateBundle } = await import('./helpers.mjs');
  const noLeaf = await nestedCanary({ env: stubEnv(canaryScenario({ nested: { transcriptsDir: mutateBundle(PROBE3, { drop: 'leaf' }) } })) });
  assert.equal(noLeaf.ok, false);
  assert.match(noLeaf.reason, /depth 3/);
  const unreconciled = await nestedCanary({ env: stubEnv(canaryScenario({ error: E6.replace('answered 2', 'answered 7') })) });
  assert.equal(unreconciled.ok, false);
  assert.match(unreconciled.reason, /W5/);
});

test('no transcripts from the CLI: the canary fails with guidance', async () => {
  const { runNestedCanaryCheck } = await import('../preflight.mjs');
  const r = await runNestedCanaryCheck({ env: stubEnv(canaryScenario({ nested: undefined })) });
  assert.equal(r.ok, false);
  assert.match(r.message, /no subagent transcripts/);
  assert.match(r.message, /--skip-nested-canary/);
});

// B2b rework: the first alpha.2 gate attempt exited 3 because the haiku outer agent did not launch the middle one
// (found depths 1). The canary retries once with a fresh run before failing, and records every attempt.
const seqCanary = (results) => { let i = 0; const calls = []; return { calls, canary: async (args) => { calls.push(args); return results[i++]; } }; };
const PASS = { ok: true, reason: null, depths: [1, 2, 3], leaf_write: true, run_error_class: null, costUsd: 0.01 };
const FAIL = { ok: false, reason: 'no transcript at depth 2, 3 (found depths 1)', depths: [1], leaf_write: false, run_error_class: null, costUsd: 0.01 };

test('the nested canary retries once after a failure: fail then pass is ok, with both attempts recorded', async () => {
  const { runNestedCanaryCheck } = await import('../preflight.mjs');
  const s = seqCanary([FAIL, PASS]);
  const r = await runNestedCanaryCheck({ env: {}, canary: s.canary });
  assert.equal(s.calls.length, 2);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.attempts.map((a) => ({ ok: a.ok, reason: a.reason })), [{ ok: false, reason: FAIL.reason }, { ok: true, reason: null }]);
  assert.match(r.message, /attempt 2 of 2/);
  assert.match(r.message, /found depths 1/);
});

test('the nested canary fails after two failed attempts and records both; a first pass does not retry', async () => {
  const { runNestedCanaryCheck } = await import('../preflight.mjs');
  const s = seqCanary([FAIL, { ...FAIL, reason: 'the depth-3 Write is not in the merged stream' }]);
  const r = await runNestedCanaryCheck({ env: {}, canary: s.canary });
  assert.equal(s.calls.length, 2);
  assert.equal(r.ok, false);
  assert.equal(r.attempts.length, 2);
  assert.match(r.message, /2 attempts/);
  assert.match(r.message, /depth-3 Write/);
  assert.match(r.message, /--skip-nested-canary/);
  const once = seqCanary([PASS, FAIL]);
  const r1 = await runNestedCanaryCheck({ env: {}, canary: once.canary });
  assert.equal(once.calls.length, 1);
  assert.equal(r1.ok, true);
  assert.equal(r1.attempts.length, 1);
});

test('the probe-nested templates are never discovered as an eval case (seeded: a plain prompt.md would be)', async () => {
  const { discover } = await import('../lib/discover.mjs');
  const { PLUGIN_DIR } = await import('../lib/paths.mjs');
  assert.ok(fs.existsSync(path.join(HERE, '..', 'probe-nested', 'prompt.md.tmpl')));
  assert.ok(!discover(PLUGIN_DIR).some((c) => c.dir.includes('probe-nested')));
  const fake = tmpDir('aiflow-disc-');
  fs.mkdirSync(path.join(fake, 'evals', 'tooling', 'probe-nested'), { recursive: true });
  fs.writeFileSync(path.join(fake, 'evals', 'tooling', 'probe-nested', 'prompt.md'), '---\n---\nx');
  assert.equal(discover(fake).length, 1, 'seeded negative: a non-.tmpl prompt.md is a case');
});
