// Fixture for run-sh.test.mjs: one failing test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('fixture fails on purpose', () => assert.equal(1, 2));
