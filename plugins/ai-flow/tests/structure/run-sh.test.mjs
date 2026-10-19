// tests/run.sh single entrypoint (REQ-001, REQ-002). Uses self-test env overrides and fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PLUGIN_ROOT, gitMode } from '../lib/plugin-files.mjs';

const RUN_SH = path.join(PLUGIN_ROOT, 'tests', 'run.sh');
const FIX = path.join(PLUGIN_ROOT, 'tests', 'fixtures', 'run-sh');

/** Run run.sh against fixtures; `env` entries override (undefined deletes). */
function runSh(env = {}, { cwd = PLUGIN_ROOT } = {}) {
  const merged = {
    ...process.env,
    AIFLOW_TESTS_SKIP_VALIDATE: '1',
    AIFLOW_TESTS_STRUCTURE_GLOB: path.join(FIX, 'pass.test.mjs'),
    AIFLOW_TESTS_EVALS_CMD: `bash ${path.join(FIX, 'fake-evals.sh')}`,
    AIFLOW_TESTS_MIN_EXECUTED: '0',
    ...env,
  };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  const res = spawnSync('bash', [RUN_SH], { cwd, env: merged, encoding: 'utf8' });
  const lines = res.stdout.trimEnd().split('\n');
  return { ...res, lines, last: lines.at(-1) };
}

test('run.sh is 100755 in the git index and ends with an executed line', () => {
  assert.equal(gitMode('plugins/ai-flow/tests/run.sh'), '100755');
  const r = runSh();
  assert.match(r.last, /^executed: \d+/, r.stdout + r.stderr);
});
