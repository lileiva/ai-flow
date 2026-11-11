// Tasks 3.9-3.10 (REQ-016 S2-S3, REQ-018 S1): promote a complete summary to a per-model baseline, with guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promote } from '../promote.mjs';
import { tmpDir } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OK = path.join(HERE, 'fixtures', 'aggregate', 'ok-summary.json');
const ok = () => JSON.parse(fs.readFileSync(OK, 'utf8'));

test('promote(ok-summary, v3.4.0) writes <outDir>/v3.4.0-sonnet.json', () => {
  const outDir = tmpDir('aiflow-promote-');
  const file = promote(ok(), { version: 'v3.4.0', outDir, expectedBehaviorHash: 'HASH-AT-v3.4.0' });
  assert.equal(file, path.join(outDir, 'v3.4.0-sonnet.json'));
  assert.ok(fs.existsSync(file));
});

import { loadSchema, validate } from '../lib/schema.mjs';
import { addWorktree, behaviorHash, removeWorktree } from '../lib/git.mjs';

const refuse = (summary, opts = {}) => assert.throws(() => promote(summary, { version: 'v3.4.0', outDir: tmpDir('aiflow-promote-'), expectedBehaviorHash: 'HASH-AT-v3.4.0', ...opts }), (e) => e.code === 'PROMOTE_REFUSED' && (opts.match ? opts.match.test(e.message) : true));

test('S2: promote refuses a partial (subset) or incomplete summary', () => {
  const sub = ok(); sub.meta.subset = true;
  refuse(sub, { match: /partial/ });
  const inc = ok(); inc.meta.complete = false; inc.meta.incomplete_reason = 'cost_cap';
  refuse(inc, { match: /incomplete/ });
});

test('promote refuses any case with fewer than 3 non-harness-error runs', () => {
  const s = ok(); s.cases.d.n = 2;
  refuse(s, { match: /case d: n=2/ });
});

test('promote refuses a summary without session_start.intended', () => {
  const s = ok(); delete s.session_start.intended;
  refuse(s, { match: /session_start/ });
});

test('S3: promote refuses plugin_ref other than the version, or a behavior_hash that differs from the tag', () => {
  const ref = ok(); ref.meta.plugin_ref = 'HEAD';
  refuse(ref, { match: /plugin_ref/ });
  const h = ok(); h.meta.behavior_hash = 'something-else';
  refuse(h, { match: /behavior_hash/ });
});

test('S3: by default the expected behavior_hash is computed from the tag itself', () => {
  const wt = addWorktree('v3.4.0');
  let tagHash;
  try { tagHash = behaviorHash(path.join(wt, 'plugins', 'ai-flow')); } finally { removeWorktree(wt); }
  const s = ok(); s.meta.behavior_hash = tagHash;
  assert.ok(fs.existsSync(promote(s, { version: 'v3.4.0', outDir: tmpDir('aiflow-promote-') })));
  refuse({ ...ok(), meta: { ...ok().meta, behavior_hash: 'nope' } }, { expectedBehaviorHash: undefined, match: /behavior_hash/ });
});

test('the written baseline validates against baseline.schema.json; raw aggregate (prompts trimmed) and metrics.jsonl are written', () => {
  const results = tmpDir('aiflow-results-');
  fs.mkdirSync(path.join(results, 'runs'));
  fs.writeFileSync(path.join(results, 'aggregate-result.json'), JSON.stringify({ cases: [{ name: 'a', prompt: 'p'.repeat(5000), arms: { with: [{ score: 1 }] } }] }));
  fs.writeFileSync(path.join(results, 'runs', 'a-0.json'), JSON.stringify({ case: 'a', run_index: 0 }));
  fs.writeFileSync(path.join(results, 'runs', 'a-1.json'), JSON.stringify({ case: 'a', run_index: 1 }));
  const s = ok(); s.meta.results_dir = results;
  const outDir = tmpDir('aiflow-promote-');
  const file = promote(s, { version: 'v3.4.0', outDir, expectedBehaviorHash: 'HASH-AT-v3.4.0' });
  assert.deepEqual(validate(loadSchema('baseline'), JSON.parse(fs.readFileSync(file, 'utf8'))), []);
  const raw = path.join(outDir, 'raw', 'v3.4.0-sonnet');
  const agg = JSON.parse(fs.readFileSync(path.join(raw, 'aggregate-result.json'), 'utf8'));
  assert.equal(agg.cases[0].prompt.length, 300);
  assert.equal(fs.readFileSync(path.join(raw, 'metrics.jsonl'), 'utf8').trim().split('\n').length, 2);
});

test('a resumed suite: local paths stay out of the baseline and each resume aggregate is kept in raw/', () => {
  const results = tmpDir('aiflow-results-');
  fs.mkdirSync(path.join(results, 'runs'));
  fs.mkdirSync(path.join(results, 'resume-b'));
  fs.writeFileSync(path.join(results, 'aggregate-result.json'), JSON.stringify({ cases: [] }));
  fs.writeFileSync(path.join(results, 'resume-b', 'aggregate-result.json'), JSON.stringify({ cases: [{ name: 'b', prompt: 'q'.repeat(900) }] }));
  const s = ok(); s.meta.results_dir = results; s.meta.resumed_from = results;
  const outDir = tmpDir('aiflow-promote-');
  const baseline = JSON.parse(fs.readFileSync(promote(s, { version: 'v3.4.0', outDir, expectedBehaviorHash: 'HASH-AT-v3.4.0' }), 'utf8'));
  for (const k of ['results_dir', 'worktree', 'resumed_from']) assert.equal(k in baseline.meta, false, k);
  assert.equal(baseline.meta.resumed, true);
  const resumeAgg = JSON.parse(fs.readFileSync(path.join(outDir, 'raw', 'v3.4.0-sonnet', 'aggregate-result.resume-b.json'), 'utf8'));
  assert.equal(resumeAgg.cases[0].prompt.length, 300);
});

test('the promote CLI exits 7 on refusal', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = tmpDir('aiflow-promote-');
  const bad = path.join(dir, 's.json');
  fs.writeFileSync(bad, JSON.stringify({ ...ok(), meta: { ...ok().meta, complete: false } }));
  const r = spawnSync(process.execPath, [path.join(HERE, '..', 'promote.mjs'), bad, '--version', 'v3.4.0', '--out-dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 7);
  assert.match(r.stderr, /refused/);
});

// Task 3.10 (REQ-018 S1, offline): the documented compare command, run against a promoted baseline itself, exits 0.
import { spawnSync } from 'node:child_process';
import { README_COMPARE_CMD, compareCommand } from '../lib/constants.mjs';
import { REPO_ROOT } from '../lib/paths.mjs';

test('README_COMPARE_CMD compares the committed sonnet baseline with itself; on a promoted baseline it exits 0', () => {
  assert.match(README_COMPARE_CMD, /compare\.mjs --baseline plugins\/ai-flow\/evals\/baselines\/v3\.4\.0-sonnet\.json --candidate plugins\/ai-flow\/evals\/baselines\/v3\.4\.0-sonnet\.json$/);
  const file = promote(ok(), { version: 'v3.4.0', outDir: tmpDir('aiflow-promote-'), expectedBehaviorHash: 'HASH-AT-v3.4.0' });
  const r = spawnSync('bash', ['-c', compareCommand(file)], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /regressions: 0/);
});

// Verify W4: raw/<name>/aggregate-result.json is the CLI's own pre-regrade output; a sibling README.md must say so.
import { RAW_README } from '../promote.mjs';

test('promote writes raw/<name>/README.md marking aggregate-result.json as raw CLI output (metrics.jsonl + baseline are authoritative)', () => {
  const results = tmpDir('aiflow-results-');
  fs.writeFileSync(path.join(results, 'aggregate-result.json'), JSON.stringify({ cases: [] }));
  const s = ok(); s.meta.results_dir = results;
  const outDir = tmpDir('aiflow-promote-');
  promote(s, { version: 'v3.4.0', outDir, expectedBehaviorHash: 'HASH-AT-v3.4.0' });
  const readme = fs.readFileSync(path.join(outDir, 'raw', 'v3.4.0-sonnet', 'README.md'), 'utf8');
  assert.equal(readme, RAW_README('v3.4.0-sonnet'));
  assert.match(readme, /raw CLI output/);
  assert.match(readme, /not regraded/);
  assert.match(readme, /metrics\.jsonl/);
  assert.match(readme, /v3\.4\.0-sonnet\.json/);
});

test('promote scrubs local paths (home, macOS temp folders, claude-<uid>) from the raw files', () => {
  const results = tmpDir('aiflow-results-');
  fs.mkdirSync(path.join(results, 'runs'));
  const local = `/private/var/${'folders'}/sh/h7_abc/T/aiflow-eval-1/plugins/ai-flow ${os.homedir()}/x /private/tmp/${'claude-'}501/-p/1`;
  fs.writeFileSync(path.join(results, 'aggregate-result.json'), JSON.stringify({ suite: { root: local } }));
  fs.writeFileSync(path.join(results, 'runs', 'a-0.json'), JSON.stringify({ case: 'a', artifacts_dir: { kept_dir: local } }));
  const s = ok(); s.meta.results_dir = results;
  const outDir = tmpDir('aiflow-promote-');
  promote(s, { version: 'v3.4.0', outDir, expectedBehaviorHash: 'HASH-AT-v3.4.0' });
  const raw = path.join(outDir, 'raw', 'v3.4.0-sonnet');
  for (const f of ['aggregate-result.json', 'metrics.jsonl']) {
    const text = fs.readFileSync(path.join(raw, f), 'utf8');
    assert.ok(!/\/private\/var\/folders/.test(text) && !text.includes(os.homedir()) && !/claude-\d+/.test(text), `${f}: ${text}`);
    assert.match(text, /\/tmp\/aiflow-eval-1\/plugins\/ai-flow/);
  }
});

// B2b Task 3.4 (REQ-011 S1-S5, REQ-009 S3/S4, REQ-016 S1; design D8, D13): alpha labels at SHA refs, raw nested-index.
import { promoteGuards, RAW_BUDGET_BYTES } from '../promote.mjs';

const GATE = '8029d9b';
const ALPHA = 'v4.0.0-alpha.2';
const ALPHA_HASH = 'a8db88f8f89b8ab7d8b3c6affcde3d771a97eeb033f08b2bbec9f6589bf64440';
const alphaSummary = () => { const s = ok(); s.meta = { ...s.meta, plugin_version: '4.0.0-alpha.2', plugin_ref: GATE, plugin_sha: '8029d9b0', behavior_hash: ALPHA_HASH }; return s; };

function resultsWithNested() {
  const results = tmpDir('aiflow-results-');
  fs.mkdirSync(path.join(results, 'runs'));
  fs.writeFileSync(path.join(results, 'aggregate-result.json'), JSON.stringify({ cases: [] }));
  const tree = [{ tool_use_id: 'o', agent: 'ai-flow:orchestrator', depth: 1, launched_by: 'main', source: 'transcript' }, { tool_use_id: 'p', agent: 'ai-flow:planner', depth: 2, launched_by: 'o', source: 'transcript' }];
  for (const i of [0, 1, 2]) {
    fs.writeFileSync(path.join(results, 'runs', `a-${i}.json`), JSON.stringify({ case: 'a-e2e', run_index: i, nested_capture: { status: 'complete', expected: 2, captured: 2, missing: [] }, agent_tree: tree, per_agent_tokens_transcript: { 'ai-flow:planner': 10, main: 1 }, tool_use: { self_delegation: { count: 0, launches: [] } }, error_raw: 'session_context for someone@example.invalid' }));
    const b = path.join(results, 'traces', `a-${i}`, 'subagents');
    fs.mkdirSync(b, { recursive: true });
    fs.writeFileSync(path.join(b, 'agent-x.jsonl'), '{"type":"user"}\n');
  }
  return results;
}

test('a SHA ref with label v4.0.0-alpha.2, matching version and hash: baseline + raw {metrics.jsonl, aggregate, nested-index.jsonl, README} with label/ref/sha/hash in meta (REQ-011 S1)', () => {
  const s = alphaSummary(); s.meta.results_dir = resultsWithNested();
  const outDir = tmpDir('aiflow-promote-');
  const file = promote(s, { version: ALPHA, outDir, expectedBehaviorHash: ALPHA_HASH });
  assert.equal(file, path.join(outDir, `${ALPHA}-sonnet.json`));
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual([b.meta.label, b.meta.plugin_ref, b.meta.plugin_sha, b.meta.behavior_hash], [ALPHA, GATE, '8029d9b0', ALPHA_HASH]);
  const raw = path.join(outDir, 'raw', `${ALPHA}-sonnet`);
  assert.deepEqual(fs.readdirSync(raw).sort(), ['README.md', 'aggregate-result.json', 'metrics.jsonl', 'nested-index.jsonl']);
  const idx = fs.readFileSync(path.join(raw, 'nested-index.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(idx.length, 3);
  assert.deepEqual(Object.keys(idx[0]).sort(), ['agents', 'bundle_sha256', 'case', 'max_depth', 'nested_capture', 'per_agent_tokens_transcript', 'run_index', 'self_delegation']);
  assert.deepEqual(idx[0].agents[1], { agent: 'ai-flow:planner', depth: 2, launched_by: 'o', source: 'transcript' });
  assert.match(idx[0].bundle_sha256, /^[0-9a-f]{64}$/);
});

test('version mismatch: --plugin-ref v3.4.0 with label v4.0.0-alpha.2 is refused naming the version (REQ-011 S2)', () => {
  assert.throws(() => promote(ok(), { version: ALPHA, outDir: tmpDir('aiflow-promote-'), expectedBehaviorHash: 'HASH-AT-v3.4.0' }), /plugin\.json version at v3\.4\.0 is 3\.4\.0, not 4\.0\.0-alpha\.2/);
});

test('behaviour drift at the SHA is refused naming both hashes (REQ-011 S3)', () => {
  const s = alphaSummary(); s.meta.behavior_hash = 'drifted';
  assert.throws(() => promote(s, { version: ALPHA, outDir: tmpDir('aiflow-promote-'), expectedBehaviorHash: ALPHA_HASH }), new RegExp(`behavior_hash drifted differs from ${GATE} \\(${ALPHA_HASH}\\)`));
});

test('one run with partial capture is refused naming the case and run (REQ-011 S4, R3)', () => {
  const s = alphaSummary();
  s.cases.a.nested_capture = { complete: 2, partial: 1, failed: 0, not_applicable: 0 };
  s.cases.a.runs = [0, 1, 2].map((i) => ({ run_index: i, harness_error: false, tokens_total: 1, cost_usd: 1, wall_time_s: 1, nested_capture: i === 1 ? 'partial' : 'complete' }));
  assert.throws(() => promote(s, { version: ALPHA, outDir: tmpDir('aiflow-promote-'), expectedBehaviorHash: ALPHA_HASH }), /case a run 1: nested capture partial/);
});

test('session_start.measured missing or failed is refused naming session_start (REQ-009 S3)', () => {
  const none = alphaSummary(); delete none.session_start.measured;
  assert.ok(promoteGuards(none, { version: ALPHA, expectedBehaviorHash: ALPHA_HASH }).some((r) => /session_start\.measured/.test(r)));
  const err = alphaSummary(); err.session_start.measured = { error: 'variant full left no trace' };
  assert.ok(promoteGuards(err, { version: ALPHA, expectedBehaviorHash: ALPHA_HASH }).some((r) => /session_start\.measured.*variant full left no trace/.test(r)));
});

test('v3.4.0 back-compat: --plugin-ref v3.4.0 --promote v3.4.0 passes the guards (REQ-011 S5)', () => {
  assert.deepEqual(promoteGuards(ok(), { version: 'v3.4.0', expectedBehaviorHash: 'HASH-AT-v3.4.0' }), []);
});

test('a label that is not v<semver> is refused ("4.0.0", "vX")', () => {
  for (const bad of ['4.0.0', 'vX']) assert.ok(promoteGuards(alphaSummary(), { version: bad, expectedBehaviorHash: ALPHA_HASH }).some((r) => /label/.test(r)), bad);
});

test('baseline.session_start.measured.as_shipped.input_delta_tokens equals the summary value (REQ-009 S4)', () => {
  const s = alphaSummary(); s.session_start.measured.as_shipped.input_delta_tokens = 2890;
  const b = JSON.parse(fs.readFileSync(promote(s, { version: ALPHA, outDir: tmpDir('aiflow-promote-'), expectedBehaviorHash: ALPHA_HASH }), 'utf8'));
  assert.equal(b.session_start.measured.as_shipped.input_delta_tokens, 2890);
});

test('the raw dir stays within the 1 MB budget and holds no home path, email or session_context; a 2 MB metrics set is refused (REQ-016 S1, R4)', () => {
  const s = alphaSummary(); s.meta.results_dir = resultsWithNested();
  const outDir = tmpDir('aiflow-promote-');
  promote(s, { version: ALPHA, outDir, expectedBehaviorHash: ALPHA_HASH });
  const raw = path.join(outDir, 'raw', `${ALPHA}-sonnet`);
  const files = fs.readdirSync(raw);
  assert.ok(files.reduce((n, f) => n + fs.statSync(path.join(raw, f)).size, 0) <= RAW_BUDGET_BYTES);
  for (const f of files) {
    const t = fs.readFileSync(path.join(raw, f), 'utf8');
    assert.ok(!/\/Users\/|@example\.invalid|session_context/.test(t), f);
  }
  const big = alphaSummary(); big.meta.results_dir = resultsWithNested();
  fs.writeFileSync(path.join(big.meta.results_dir, 'runs', 'a-3.json'), JSON.stringify({ case: 'a', run_index: 3, pad: 'x'.repeat(2 * 1024 * 1024) }));
  const out2 = tmpDir('aiflow-promote-');
  assert.throws(() => promote(big, { version: ALPHA, outDir: out2, expectedBehaviorHash: ALPHA_HASH }), /over the 1 MB raw budget/);
  assert.equal(fs.existsSync(path.join(out2, `${ALPHA}-sonnet.json`)), false, 'nothing is left behind');
  assert.equal(fs.existsSync(path.join(out2, 'raw', `${ALPHA}-sonnet`)), false);
});

// B2b rework: promote from a $0 regrade dir. metrics.jsonl comes from the regraded runs (results_dir); the CLI's
// aggregate-result.json and the bundle hashes come from the source gate dir (regraded_from); no local path in meta.
test('promote from a regrade: metrics.jsonl from the regraded runs, aggregate and bundle hashes from regraded_from, regrade meta kept without local paths', () => {
  const source = resultsWithNested();
  const regraded = tmpDir('aiflow-regraded-');
  fs.mkdirSync(path.join(regraded, 'runs'));
  for (const f of fs.readdirSync(path.join(source, 'runs'))) {
    const r = JSON.parse(fs.readFileSync(path.join(source, 'runs', f), 'utf8'));
    fs.writeFileSync(path.join(regraded, 'runs', f), JSON.stringify({ ...r, tdd: { marker: 'regraded' } }));
  }
  const s = alphaSummary();
  s.meta = { ...s.meta, results_dir: regraded, regraded_from: source, regraded_at: '2026-10-23T20:00:00.000Z', regrade_reason: 'W5 fix' };
  const outDir = tmpDir('aiflow-promote-');
  const b = JSON.parse(fs.readFileSync(promote(s, { version: ALPHA, outDir, expectedBehaviorHash: ALPHA_HASH }), 'utf8'));
  assert.equal(b.meta.regraded_at, '2026-10-23T20:00:00.000Z');
  assert.equal(b.meta.regrade_reason, 'W5 fix');
  assert.equal(b.meta.regraded_from, path.basename(source));
  assert.ok(!JSON.stringify(b.meta).includes(os.tmpdir()), JSON.stringify(b.meta));
  const raw = path.join(outDir, 'raw', `${ALPHA}-sonnet`);
  const metrics = fs.readFileSync(path.join(raw, 'metrics.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(metrics.map((m) => m.tdd.marker), ['regraded', 'regraded', 'regraded']);
  assert.ok(fs.existsSync(path.join(raw, 'aggregate-result.json')));
  const idx = fs.readFileSync(path.join(raw, 'nested-index.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  for (const l of idx) assert.match(l.bundle_sha256 ?? '', /^[0-9a-f]{64}$/);
});
