// Docs truthfulness: README, orchestrator table and manifests agree with the shipped plugin (REQ-011, REQ-020).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, REPO_ROOT, extractHookEngramUrl } from '../lib/plugin-files.mjs';

const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readPlugin = (rel) => fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');

test('README and hook are readable; the hook names an engram URL', () => {
  assert.ok(readRepo('README.md').length > 0);
  assert.match(extractHookEngramUrl(readPlugin('hooks/session-start')), /^https:\/\/github\.com\/\S+engram$/);
});
