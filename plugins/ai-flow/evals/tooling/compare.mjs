#!/usr/bin/env node
// Compare a candidate summary against a baseline per case and metric (REQ-017).
// A metric regresses when the candidate mean is worse than the baseline mean by more than the threshold:
// max(baseline stdev, config.rateTolerance = 0.34) for rate metrics (U4), max(baseline stdev, --abs-tolerance)
// otherwise. Directions come from config.metrics. n/a cells and cases not run are listed, never flagged.
// Exit 1 on any regression.
// Usage: node compare.mjs --baseline <b.json> --candidate <summary.json> [--abs-tolerance 0] [--markdown] [--json <out>]
//                         [--allow-env-mismatch]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './lib/config.mjs';

export const HEADER = ['case', 'metric', 'baseline', 'candidate', 'delta', 'status'];
const round = (x) => Math.round(x * 1000) / 1000;
const isStat = (v) => v && typeof v === 'object' && typeof v.mean === 'number';
const show = (v) => (isStat(v) ? String(v.mean) : v === null || v === undefined ? '-' : String(v));

function compareStat(cs, metric, b, c, { better, threshold }) {
  const r = { case: cs, metric, baseline: show(b), candidate: show(c), delta: '', status: 'n/a' };
  // REQ-014 S1: a metric one side does not record at all (e.g. self_delegation in a v3.4.0 baseline) is never flagged.
  if (b === undefined && c !== undefined) r.status = 'n/a (baseline)';
  else if (c === undefined && b !== undefined) r.status = 'n/a (candidate)';
  if (!isStat(b) || !isStat(c)) return r;
  const delta = round(c.mean - b.mean);
  const worse = better === 'higher' ? -delta : delta;
  const limit = Math.max(b.stdev, threshold);
  r.delta = delta;
  r.status = worse > 0 && worse > limit ? 'regression' : -worse > limit ? 'improvement' : 'ok';
  return r;
}

/** Expand per_phase_tokens into per-agent metrics. */
function metricEntries(caseB, caseC, metrics) {
  const out = [];
  for (const [name, spec] of Object.entries(metrics)) {
    if (name === 'per_phase_tokens') {
      const agents = new Set([...Object.keys(caseB?.[name] ?? {}), ...Object.keys(caseC?.[name] ?? {})]);
      for (const a of [...agents].sort()) out.push([`${name}.${a}`, spec, caseB?.[name]?.[a], caseC?.[name]?.[a]]);
    } else out.push([name, spec, caseB?.[name], caseC?.[name]]);
  }
  return out;
}

export const EXIT_ENV_MISMATCH = 6;
const major = (v) => String(v ?? '').split('.')[0];

/** Reasons the two results are not comparable (U1): different eval model or claude major version. */
export function envMismatch(baseline, candidate) {
  const out = [];
  if (baseline.meta?.model !== candidate.meta?.model) out.push(`model mismatch: baseline ${baseline.meta?.model}, candidate ${candidate.meta?.model}`);
  if (major(baseline.meta?.claude_version) !== major(candidate.meta?.claude_version)) out.push(`claude major mismatch: baseline ${baseline.meta?.claude_version}, candidate ${candidate.meta?.claude_version}`);
  return out;
}

export function compare(baseline, candidate, { absTolerance = 0, allowEnvMismatch = false, config = loadConfig() } = {}) {
  const mismatch = envMismatch(baseline, candidate);
  if (mismatch.length && !allowEnvMismatch) return { rows: [], regressions: 0, envMismatch: mismatch, exitCode: EXIT_ENV_MISMATCH };
  const rows = [];
  for (const cs of Object.keys(baseline.cases).sort()) {
    if (!candidate.cases[cs]) {
      rows.push({ case: cs, metric: '*', baseline: '', candidate: '', delta: '', status: 'not run' });
      continue;
    }
    for (const [metric, spec, b, c] of metricEntries(baseline.cases[cs], candidate.cases[cs], config.metrics)) {
      const threshold = spec.rate ? config.rateTolerance : absTolerance;
      rows.push(compareStat(cs, metric, b, c, { better: spec.better, threshold }));
    }
  }
  const regressions = rows.filter((r) => r.status === 'regression').length;
  return { rows, regressions, envMismatch: mismatch, notes: notesFor(baseline, candidate), outliers: outliers(baseline, candidate), exitCode: regressions ? 1 : 0 };
}

/** D8: a baseline promoted before nested capture graded delegated runs' TDD/artifacts/tool-use as n/a. */
function notesFor(baseline, candidate) {
  if (baseline.meta?.observability || !candidate.meta?.observability) return [];
  return ['baseline predates nested capture (no meta.observability): its delegated-run TDD, artifact and tool-use grades were n/a (not observable), so those cells compare as n/a'];
}

/** Informational metrics (D-2) shown per run when the candidate is worse than the baseline by more than 1 sd (REQ-010 S2). */
export const PER_RUN_METRICS = ['tokens_total', 'cost_usd', 'wall_time_s'];

function outliers(baseline, candidate) {
  const out = [];
  for (const [cs, c] of Object.entries(candidate.cases ?? {}).sort()) {
    const b = baseline.cases?.[cs];
    if (!b || !Array.isArray(c.runs)) continue;
    for (const m of PER_RUN_METRICS) {
      if (!isStat(b[m]) || !isStat(c[m]) || !(c[m].mean - b[m].mean > b[m].stdev)) continue;
      out.push({ case: cs, metric: m, baseline: b[m], values: c.runs.map((r) => r[m] ?? null) });
    }
  }
  return out;
}

const signed = (d) => (typeof d === 'number' && d > 0 ? `+${d}` : String(d));

export function formatTable(rows, { markdown = false } = {}) {
  const lines = rows.map((r) => HEADER.map((h) => (h === 'delta' ? signed(r.delta) : String(r[h] ?? ''))));
  if (markdown) return [HEADER, HEADER.map(() => '---'), ...lines].map((c) => `| ${c.join(' | ')} |`).join('\n');
  return [HEADER, ...lines].map((c) => c.join(' | ')).join('\n');
}

/** Table, notes and (markdown) the per-run block for informational outliers (REQ-010 S2). */
export function formatReport(res, { markdown = false } = {}) {
  const parts = [formatTable(res.rows, { markdown })];
  for (const n of res.notes ?? []) parts.push(`note: ${n}`);
  if (markdown && res.outliers?.length) {
    parts.push(['### Per-run detail (informational metric worse than baseline by more than 1 sd)', '', '| case | metric | runs (candidate) | baseline mean (sd) |', '| --- | --- | --- | --- |',
      ...res.outliers.map((o) => `| ${o.case} | ${o.metric} | ${o.values.join(', ')} | ${o.baseline.mean} (${o.baseline.stdev}) |`)].join('\n'));
  }
  return parts.join('\n\n');
}

export function main(argv = process.argv.slice(2)) {
  const get = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
  const baseline = JSON.parse(fs.readFileSync(get('--baseline'), 'utf8'));
  const candidate = JSON.parse(fs.readFileSync(get('--candidate'), 'utf8'));
  const res = compare(baseline, candidate, { absTolerance: Number(get('--abs-tolerance') ?? 0), allowEnvMismatch: argv.includes('--allow-env-mismatch') });
  if (res.exitCode === EXIT_ENV_MISMATCH) {
    console.error(`compare: refusing to compare: ${res.envMismatch.join('; ')} (pass --allow-env-mismatch to override)`);
    return res.exitCode;
  }
  for (const m of res.envMismatch) console.error(`compare: warning: ${m} (allowed)`);
  console.log(formatReport(res, { markdown: argv.includes('--markdown') }));
  console.log(`\nregressions: ${res.regressions}`);
  if (get('--json')) fs.writeFileSync(get('--json'), JSON.stringify(res, null, 2));
  return res.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
