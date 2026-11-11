// Task 2.8 (REQ-007 S6, REQ-019 S1): grader tests run offline, with no API key and a CLI that cannot run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('grader tests pass with ANTHROPIC_API_KEY unset and AIFLOW_EVAL_CLAUDE_BIN=/bin/false', () => {
  const env = { ...process.env, AIFLOW_EVAL_CLAUDE_BIN: '/bin/false' };
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  delete env.NODE_TEST_CONTEXT; // else the child reports to this runner instead of stdout
  const files = ['tdd.test.mjs', 'trace.test.mjs'].map((f) => path.join(HERE, f));
  const r = spawnSync(process.execPath, ['--test', ...files], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr.slice(-2000));
  assert.match(r.stdout, /fail 0/);
});
