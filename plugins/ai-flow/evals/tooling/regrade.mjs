#!/usr/bin/env node
// $0 regrade of a results dir (B2b design D10): every runs/<case>-<i>.json is re-analyzed from its retained
// bundle traces/<case>-<i>/ (or a legacy flat traces/<case>-<i>.trace.jsonl), keeping the outcome and CLI fields
// of the prior metrics (no workspace is needed), then re-summarized with the prior meta and SessionStart.
// A CLI run-error (error_raw) is re-classified (W5 run_error) from the bundle rather than copied.
// The regraded summary keeps session_start (incl. measured) and records meta.regraded_at, meta.regrade_reason,
// meta.regraded_from (the source dir: aggregate-result.json, traces/) and meta.results_dir = the regrade dir, so
// promote.mjs can promote it directly (metrics from the regraded runs, raw CLI data from the source).
// Usage: node regrade.mjs <results-dir> [--out <dir>] [--reason <text>]   (default --out <results-dir>/regrade)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeTrace } from './analyze.mjs';
import { caseId, summarize } from './summarize.mjs';
import { LEGACY_REASON, loadBundle } from './lib/nested.mjs';
import { classifyRunError } from './lib/classify.mjs';

/** Fields recomputed from the trace; everything else (outcome, cli, harness_error, ...) is kept. */
const GRADED = ['tokens', 'per_phase', 'per_phase_reason', 'per_phase_source', 'per_phase_coverage', 'tdd', 'phases', 'artifacts', 'tool_use', 'session_start', 'env', 'parse_errors', 'nested_capture', 'agent_tree', 'per_agent_tokens_transcript'];

export { LEGACY_REASON };

/** Trace text and bundle of one run slot, or null when the results dir kept no trace for it. */
export function traceSource(resultsDir, slot) {
  const dir = path.join(resultsDir, 'traces', slot);
  if (fs.existsSync(path.join(dir, 'trace.jsonl'))) return { text: fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8'), bundle: loadBundle(dir) };
  const flat = path.join(resultsDir, 'traces', `${slot}.trace.jsonl`);
  if (fs.existsSync(flat)) return { text: fs.readFileSync(flat, 'utf8'), bundle: { agents: [], mockCalls: [], errors: [], source: 'none', reason: LEGACY_REASON } };
  return null;
}

export function regradeRun(prior, resultsDir) {
  if (prior.harness_error) return prior;
  const src = traceSource(resultsDir, `${caseId(prior.case)}-${prior.run_index}`);
  if (!src) return prior;
  const a = analyzeTrace(src.text, { caseName: prior.case, bundle: src.bundle });
  const m = { ...prior };
  for (const k of GRADED) if (a[k] !== undefined) m[k] = a[k];
  // W5 (D7): the CLI error is re-classified against the retained bundle; only run-error <-> null moves.
  if (prior.error_raw) {
    m.run_error = classifyRunError(prior.error_raw, a);
    if (m.run_error.class === 'nested_mock_accounting' && prior.failure_reason === 'run-error') m.failure_reason = null;
    else if (m.run_error.class === 'unexplained' && prior.failure_reason == null) m.failure_reason = 'run-error';
  }
  return m;
}

export function regrade(resultsDir, outDir = path.join(resultsDir, 'regrade'), { reason = null, now = () => new Date().toISOString() } = {}) {
  const runsDir = path.join(resultsDir, 'runs');
  const priorSummary = JSON.parse(fs.readFileSync(path.join(resultsDir, 'summary.json'), 'utf8'));
  fs.mkdirSync(path.join(outDir, 'runs'), { recursive: true });
  const runs = [];
  for (const f of fs.readdirSync(runsDir).filter((x) => x.endsWith('.json')).sort()) {
    const m = regradeRun(JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf8')), resultsDir);
    fs.writeFileSync(path.join(outDir, 'runs', f), JSON.stringify(m, null, 2));
    runs.push(m);
  }
  const meta = { ...priorSummary.meta, results_dir: path.resolve(outDir), regraded_from: path.resolve(resultsDir), regraded_at: now(), regrade_reason: reason };
  const summary = summarize(runs, meta, { sessionStartIntended: priorSummary.session_start?.intended ?? null, sessionStartMeasured: priorSummary.session_start?.measured ?? null });
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  return { outDir, runs, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const oi = argv.indexOf('--out');
  const ri = argv.indexOf('--reason');
  const dir = argv.find((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1) && (ri < 0 || i !== ri + 1));
  if (!dir) { console.error('usage: node regrade.mjs <results-dir> [--out <dir>] [--reason <text>]'); process.exit(2); }
  const { outDir } = regrade(path.resolve(dir), oi >= 0 ? path.resolve(argv[oi + 1]) : undefined, { reason: ri >= 0 ? argv[ri + 1] : null });
  console.log(`summary: ${path.join(outDir, 'summary.json')}`);
}
