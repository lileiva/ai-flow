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
import { addWorktree, behaviorHash, removeWorktree } from './lib/git.mjs';
import { loadSchema, validate } from './lib/schema.mjs';
import { scrubLocalPaths } from './lib/scrub.mjs';

export const MIN_RUNS = 3;
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

export function promoteGuards(summary, { version, expectedBehaviorHash }) {
  const m = summary.meta ?? {};
  const reasons = [];
  if (m.subset) reasons.push('summary is a partial suite (subset of cases or tags)');
  if (m.complete !== true) reasons.push(`summary is incomplete (${m.incomplete_reason ?? 'complete=false'})`);
  for (const [id, c] of Object.entries(summary.cases ?? {})) if (!(c.n >= MIN_RUNS)) reasons.push(`case ${id}: n=${c.n} (needs ${MIN_RUNS} non-harness-error runs)`);
  if (!summary.session_start?.as_shipped || !summary.session_start?.intended) reasons.push('session_start.as_shipped and session_start.intended are required (run measure-session-start)');
  if (m.plugin_ref !== version) reasons.push(`plugin_ref ${m.plugin_ref} is not ${version}`);
  if (m.behavior_hash !== expectedBehaviorHash) reasons.push(`behavior_hash ${m.behavior_hash} differs from ${version} (${expectedBehaviorHash})`);
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

function writeRaw(resultsDir, rawDir) {
  if (!resultsDir || !fs.existsSync(resultsDir)) return;
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'README.md'), RAW_README(path.basename(rawDir)));
  const writeAgg = (src, name) => {
    if (fs.existsSync(src)) fs.writeFileSync(path.join(rawDir, name), scrubLocalPaths(JSON.stringify(trimPrompts(JSON.parse(fs.readFileSync(src, 'utf8'))), null, 2)) + '\n');
  };
  writeAgg(path.join(resultsDir, 'aggregate-result.json'), 'aggregate-result.json');
  // A resumed suite (run.mjs --resume) leaves one resume-<id>/aggregate-result.json per re-run case.
  for (const d of fs.readdirSync(resultsDir).filter((f) => /^resume-[a-z]+$/.test(f)).sort()) {
    writeAgg(path.join(resultsDir, d, 'aggregate-result.json'), `aggregate-result.${d}.json`);
  }
  const runsDir = path.join(resultsDir, 'runs');
  if (fs.existsSync(runsDir)) {
    const lines = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.stringify(JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf8'))));
    fs.writeFileSync(path.join(rawDir, 'metrics.jsonl'), scrubLocalPaths(lines.join('\n')) + '\n');
  }
}

export function promote(summary, { version, outDir = path.join(EVALS_DIR, 'baselines'), expectedBehaviorHash }) {
  const expected = expectedBehaviorHash ?? behaviorHashAt(version);
  const reasons = promoteGuards(summary, { version, expectedBehaviorHash: expected });
  if (reasons.length) throw refused(reasons);
  const meta = Object.fromEntries(Object.entries(summary.meta).filter(([k]) => !RUNTIME_META.includes(k)));
  if (summary.meta.resumed_from) meta.resumed = true;
  const baseline = { ...summary, meta };
  const errors = validate(loadSchema('baseline'), baseline);
  if (errors.length) throw refused(errors.map((e) => `${e.path} ${e.message}`));
  const name = `${version}-${summary.meta.model}`;
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n');
  writeRaw(summary.meta.results_dir, path.join(outDir, 'raw', name));
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
