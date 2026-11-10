// Task 3.1 (REQ-013 S1 routing_coverage, REQ-003 S3 metric). Informational: not in the D-2 blocking set (R6, R12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTrace } from '../analyze.mjs';

const TRACES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'traces');
const read = (name) => fs.readFileSync(path.join(TRACES, `${name}.jsonl`), 'utf8');

test('analyzeTrace result has routing.routing_coverage', () => {
  const a = analyzeTrace(read('tdd-test-first'));
  assert.ok(a.routing, 'routing block present');
  assert.ok('routing_coverage' in a.routing, 'routing_coverage key present');
});
