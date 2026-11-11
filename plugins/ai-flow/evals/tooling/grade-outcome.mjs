#!/usr/bin/env node
// Outcome grader (REQ-006, design D5). Copies a kept run workspace into a fresh grading dir, adds clean
// node_modules, then runs (1) the visible suite and (2) the case's hidden acceptance suite with vitest's
// JSON reporter, both under OS containment. The source workspace is never modified.
// Usage: node grade-outcome.mjs <workspace> <case-dir> [--unsafe-host-grading]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NODE26_CACHE, TEXTKIT_CACHE } from './lib/paths.mjs';
import { cloneTree } from './lib/node-runtime.mjs';
import { runSandboxed } from './lib/sandbox.mjs';

const EXCLUDE = new Set(['.git', 'node_modules', '.eval-node', '.eval-acceptance']);
const ACCEPT_DIR = '.eval-acceptance';
const TIMEOUT_MS = 120_000;

function copyWorkspace(src, dest) {
  for (const name of fs.readdirSync(src)) {
    if (EXCLUDE.has(name)) continue;
    fs.cpSync(path.join(src, name), path.join(dest, name), { recursive: true, verbatimSymlinks: true });
  }
}

function readReport(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { passed: j.numPassedTests ?? 0, failed: j.numFailedTests ?? 0, total: j.numTotalTests ?? 0 };
  } catch {
    return { passed: 0, failed: 0, total: 0 };
  }
}

function vitest(gradingDir, extraArgs, reportName, opts) {
  const node = path.join(opts.nodeDir, 'bin', 'node');
  const report = path.join(gradingDir, reportName);
  const argv = [node, path.join(gradingDir, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--reporter=json', `--outputFile=${report}`, ...extraArgs];
  const r = runSandboxed(argv, { cwd: gradingDir, writableDir: gradingDir, timeoutMs: TIMEOUT_MS, unsafeHostGrading: opts.unsafeHostGrading, containment: opts.containment });
  return { exit: r.timedOut ? null : r.status, timed_out: r.timedOut, ...readReport(report), containment: r.containment, stderr_tail: r.stderr.slice(-2000) };
}

/**
 * Grade one workspace against a case's acceptance/ suite.
 * Returns { visible, acceptance, pass, containment, gradingDir? }. acceptance is null when the case has none.
 */
export function gradeOutcome({ workspace, caseDir, nodeDir = NODE26_CACHE, modulesDir = path.join(TEXTKIT_CACHE, 'node_modules'), unsafeHostGrading = false, containment, keepGradingDir = false }) {
  const gradingDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-grade-')));
  const opts = { nodeDir, unsafeHostGrading, ...(containment !== undefined ? { containment } : {}) };
  try {
    copyWorkspace(workspace, gradingDir);
    cloneTree(modulesDir, path.join(gradingDir, 'node_modules'));
    const visible = vitest(gradingDir, [], '.eval-visible.json', opts);
    let acceptance = null;
    const acceptSrc = path.join(caseDir, 'acceptance');
    if (fs.existsSync(acceptSrc)) {
      const dest = path.join(gradingDir, ACCEPT_DIR);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(acceptSrc, dest, { recursive: true });
      fs.writeFileSync(path.join(dest, 'vitest.config.mjs'), `export default { test: { include: ['${ACCEPT_DIR}/**/*.test.js'] } };\n`);
      acceptance = vitest(gradingDir, ['--config', `${ACCEPT_DIR}/vitest.config.mjs`], '.eval-acceptance.json', opts);
    }
    const pass = visible.exit === 0 && (acceptance === null || (acceptance.exit === 0 && acceptance.failed === 0 && acceptance.total > 0));
    return { visible, acceptance, pass, containment: visible.containment, ...(keepGradingDir ? { gradingDir } : {}) };
  } finally {
    if (!keepGradingDir) fs.rmSync(gradingDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [workspace, caseDir] = process.argv.slice(2);
  const r = gradeOutcome({ workspace, caseDir, unsafeHostGrading: process.argv.includes('--unsafe-host-grading') });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.pass ? 0 : 1);
}
