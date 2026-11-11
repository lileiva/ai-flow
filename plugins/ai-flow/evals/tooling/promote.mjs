#!/usr/bin/env node
// Promote a complete run summary to a per-model baseline (REQ-016, U1, U5).
// Refuses (exit 7): a subset or incomplete summary, any case with n < 3, a missing session_start.intended,
// plugin_ref other than the version, or a behavior_hash that differs from the hash of the tag's plugin files.
// Writes <out>/<version>-<model>.json plus raw/<version>-<model>/{README.md, aggregate-result.json (prompts trimmed),
// metrics.jsonl}, with local paths scrubbed.
// Usage: node promote.mjs <summary.json> --version v3.4.0 [--out-dir <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EVALS_DIR } from './lib/paths.mjs';
import crypto from 'node:crypto';
import { addWorktree, behaviorHash, removeWorktree, versionAt } from './lib/git.mjs';
import { loadSchema, validate } from './lib/schema.mjs';
import { scrubEmails, scrubLocalPaths } from './lib/scrub.mjs';

export const MIN_RUNS = 3;
/** D13: the committed raw dir of a baseline stays under this size (evals/ ships inside the plugin install). */
export const RAW_BUDGET_BYTES = 1024 * 1024;
export const LABEL_RE = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
export const EXIT_PROMOTE_REFUSED = 7;
const PROMPT_MAX = 300;
const RUNTIME_META = ['worktree', 'results_dir', 'resumed_from'];

function refused(reasons) {
  const err = new Error(`promote refused: ${reasons.join('; ')}`);
  err.code = 'PROMOTE_REFUSED';
  err.reasons = reasons;
  return err;
}

/** behavior_hash of plugins/ai-flow at a git ref (agents/ skills/ commands/ hooks/ .mcp.json plugin.json). */
export function behaviorHashAt(ref) {
  const wt = addWorktree(ref);
  try { return behaviorHash(path.join(wt, 'plugins', 'ai-flow')); } finally { removeWorktree(wt); }
}

/**
 * Promotion guards (REQ-011, B2b D8). `version` is the baseline label (v<semver>, prerelease allowed); plugin_ref may
 * be a tag or a commit SHA. Refused: a subset or incomplete summary, a case with n < 3, missing session_start
 * (as_shipped, intended, and a successful measured), a label that is not v<semver>, plugin.json version at
 * plugin_ref other than the label, a release label whose plugin_ref is not that tag, a behavior_hash other than the
 * hash at plugin_ref, and any non-harness run whose nested capture is partial or failed (R3).
 */
export function promoteGuards(summary, { version, expectedBehaviorHash, versionAtRef = versionAt }) {
  const m = summary.meta ?? {};
  const reasons = [];
  if (m.subset) reasons.push('summary is a partial suite (subset of cases or tags)');
  if (m.complete !== true) reasons.push(`summary is incomplete (${m.incomplete_reason ?? 'complete=false'})`);
  for (const [id, c] of Object.entries(summary.cases ?? {})) if (!(c.n >= MIN_RUNS)) reasons.push(`case ${id}: n=${c.n} (needs ${MIN_RUNS} non-harness-error runs)`);
  if (!summary.session_start?.as_shipped || !summary.session_start?.intended) reasons.push('session_start.as_shipped and session_start.intended are required (run measure-session-start)');
  const measured = summary.session_start?.measured;
  if (!measured) reasons.push('session_start.measured is required (run with --gate or --promote, or pass --session-start <file>)');
  else if (measured.error) reasons.push(`session_start.measured failed: ${measured.error}`);
  else if (typeof measured.as_shipped?.input_delta_tokens !== 'number') reasons.push('session_start.measured.as_shipped.input_delta_tokens is missing');
  if (!LABEL_RE.test(String(version ?? ''))) reasons.push(`label ${version} is not v<semver> (e.g. v4.0.0-alpha.2)`);
  else {
    let atRef = null;
    try { atRef = versionAtRef(m.plugin_ref); } catch (e) { reasons.push(`plugin_ref ${m.plugin_ref}: cannot read plugin.json (${e.message.split('\n')[0]})`); }
    if (atRef !== null && atRef !== version.slice(1)) reasons.push(`plugin.json version at ${m.plugin_ref} is ${atRef}, not ${version.slice(1)} (plugin_ref must hold the labelled version)`);
    // A release label promoted from its own tag stays byte-compatible with v3.4.0; prereleases may use a SHA.
    if (!version.includes('-') && m.plugin_ref !== version && atRef === version.slice(1)) reasons.push(`plugin_ref ${m.plugin_ref} is not ${version} (a release label is promoted from its tag)`);
  }
  if (m.behavior_hash !== expectedBehaviorHash) reasons.push(`behavior_hash ${m.behavior_hash} differs from ${m.plugin_ref} (${expectedBehaviorHash})`);
  for (const [id, c] of Object.entries(summary.cases ?? {})) {
    const bad = (c.runs ?? []).filter((r) => !r.harness_error && ['partial', 'failed'].includes(r.nested_capture));
    for (const r of bad) reasons.push(`case ${id} run ${r.run_index}: nested capture ${r.nested_capture} (re-run it before promoting)`);
    if (!c.runs && (c.nested_capture?.partial || c.nested_capture?.failed)) reasons.push(`case ${id}: nested capture partial ${c.nested_capture.partial}, failed ${c.nested_capture.failed}`);
  }
  return reasons;
}

const trimPrompts = (v) => {
  if (Array.isArray(v)) return v.map(trimPrompts);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'prompt' && typeof x === 'string' ? x.slice(0, PROMPT_MAX) : trimPrompts(x)]));
  return v;
};

/** README written next to the raw files: aggregate-result.json is the CLI's own grading, not the regraded metrics. */
export const RAW_README = (name) => `# raw/${name}

Raw data behind \`../../${name}.json\`, copied by \`tooling/promote.mjs\`. Local paths are scrubbed.

- \`aggregate-result.json\` (and any \`aggregate-result.resume-<id>.json\`): raw CLI output (\`claude plugin eval\`),
  with prompts trimmed. Its scores and pass flags come from the CLI's own graders at run time; it is not regraded
  when the ai-flow graders change, so it can disagree with the metrics (for example, delegated runs that score 0).
- \`metrics.jsonl\`: one line per run, graded by the ai-flow analyzers (regraded at $0 when graders change).

Authoritative metrics: \`metrics.jsonl\` and the baseline \`../../${name}.json\`. Use \`aggregate-result.json\` only
for the CLI's raw view of a run.
`;

const scrub = (t) => scrubEmails(scrubLocalPaths(t));
/** R4: the CLI's session_context attachment name never reaches committed raw data (it carried the host email). */
const dropSessionContext = (t) => t.replaceAll('session_context', 'session-ctx');

/** sha256 over the relative paths and contents of a retained run bundle (results/<ts>/traces/<case>-<i>/), or null. */
function bundleSha256(dir) {
  if (!fs.existsSync(dir)) return null;
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(dir, { recursive: true }).map(String).sort()) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isFile()) h.update(`${f}\0`).update(fs.readFileSync(p)).update('\0');
  }
  return h.digest('hex');
}

/** D13: one small line per run with its agent tree; the transcripts themselves are not committed. */
const nestedIndexLine = (r, resultsDir) => ({
  case: r.case, run_index: r.run_index, nested_capture: r.nested_capture?.status ?? null,
  max_depth: r.agent_tree ? Math.max(0, ...r.agent_tree.map((t) => t.depth ?? 0)) : null,
  agents: (r.agent_tree ?? []).map((t) => ({ agent: t.agent, depth: t.depth, launched_by: t.launched_by, source: t.source })),
  per_agent_tokens_transcript: r.per_agent_tokens_transcript ?? null,
  self_delegation: typeof r.tool_use?.self_delegation === 'object' ? r.tool_use.self_delegation.count : r.tool_use?.self_delegation ?? null,
  bundle_sha256: bundleSha256(path.join(resultsDir, 'traces', `${String(r.case).split('-')[0]}-${r.run_index}`)),
});

/**
 * Raw files of a baseline. `resultsDir` holds the graded runs/; `sourceDir` (a regrade's regraded_from, else
 * resultsDir) holds the CLI's aggregate-result*.json and the retained traces/ bundles.
 */
function writeRaw(resultsDir, rawDir, sourceDir = resultsDir) {
  if (!resultsDir || !fs.existsSync(resultsDir)) return;
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'README.md'), RAW_README(path.basename(rawDir)));
  const writeAgg = (src, name) => {
    if (fs.existsSync(src)) fs.writeFileSync(path.join(rawDir, name), scrub(JSON.stringify(trimPrompts(JSON.parse(fs.readFileSync(src, 'utf8'))), null, 2)) + '\n');
  };
  writeAgg(path.join(sourceDir, 'aggregate-result.json'), 'aggregate-result.json');
  // A resumed suite (run.mjs --resume) leaves one resume-<id>/aggregate-result.json per re-run case.
  for (const d of fs.readdirSync(sourceDir).filter((f) => /^resume-[a-z]+$/.test(f)).sort()) {
    writeAgg(path.join(sourceDir, d, 'aggregate-result.json'), `aggregate-result.${d}.json`);
  }
  const runsDir = path.join(resultsDir, 'runs');
  if (fs.existsSync(runsDir)) {
    const runs = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf8')));
    fs.writeFileSync(path.join(rawDir, 'metrics.jsonl'), dropSessionContext(scrub(runs.map((r) => JSON.stringify(r)).join('\n'))) + '\n');
    const nested = runs.filter((r) => r.nested_capture);
    if (nested.length) fs.writeFileSync(path.join(rawDir, 'nested-index.jsonl'), scrub(nested.map((r) => JSON.stringify(nestedIndexLine(r, sourceDir))).join('\n')) + '\n');
  }
}

export function promote(summary, { version, outDir = path.join(EVALS_DIR, 'baselines'), expectedBehaviorHash, versionAtRef }) {
  const expected = expectedBehaviorHash ?? behaviorHashAt(summary.meta?.plugin_ref ?? version);
  const reasons = promoteGuards(summary, { version, expectedBehaviorHash: expected, ...(versionAtRef ? { versionAtRef } : {}) });
  if (reasons.length) throw refused(reasons);
  const meta = { ...Object.fromEntries(Object.entries(summary.meta).filter(([k]) => !RUNTIME_META.includes(k))), label: version };
  if (summary.meta.resumed_from) meta.resumed = true;
  // A $0 regrade (regrade.mjs) is promoted from its own dir; only the source dir's name is kept (no local path).
  if (summary.meta.regraded_from) meta.regraded_from = path.basename(summary.meta.regraded_from);
  const baseline = { ...summary, meta };
  const errors = validate(loadSchema('baseline'), baseline);
  if (errors.length) throw refused(errors.map((e) => `${e.path} ${e.message}`));
  const name = `${version}-${summary.meta.model}`;
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.json`);
  const rawDir = path.join(outDir, 'raw', name);
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n');
  writeRaw(summary.meta.results_dir, rawDir, summary.meta.regraded_from ?? summary.meta.results_dir);
  const bytes = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).reduce((n, f) => n + fs.statSync(path.join(rawDir, f)).size, 0) : 0;
  if (bytes > RAW_BUDGET_BYTES) {
    fs.rmSync(rawDir, { recursive: true, force: true });
    fs.rmSync(file, { force: true });
    throw refused([`raw/${name} would be ${bytes} bytes, over the 1 MB raw budget (D13)`]);
  }
  return file;
}

export function main(argv = process.argv.slice(2)) {
  const get = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
  try {
    console.log(promote(JSON.parse(fs.readFileSync(argv[0], 'utf8')), { version: get('--version'), outDir: get('--out-dir') }));
    return 0;
  } catch (e) {
    if (e.code !== 'PROMOTE_REFUSED') throw e;
    console.error(e.message);
    return EXIT_PROMOTE_REFUSED;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
