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
