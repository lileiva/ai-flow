// Task 0.1 (REQ-019 S1): the self-test wrapper runs node --test on this directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('node runtime major version is >= 20', () => {
  const major = Number(process.versions.node.split('.')[0]);
  assert.ok(major >= 20, `node ${process.versions.node} is too old`);
});
