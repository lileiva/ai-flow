// User decision 2 (2026-10-18): preflight (task 4.1) only WARNS on high subscription utilization; never blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimitStatus, utilizationWarning } from '../lib/ratelimit.mjs';

const ev = (info) => ({ type: 'rate_limit_event', rate_limit_info: info });

test('rateLimitStatus reads the highest utilization per window from rate_limit_event lines', () => {
  const s = rateLimitStatus([ev({ status: 'allowed', rateLimitType: 'five_hour', utilization: 0.2 }), ev({ status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.8, resetsAt: 1760000000 }), { type: 'assistant' }]);
  assert.deepEqual(s, { five_hour: { utilization: 0.2, status: 'allowed', resets_at: null }, seven_day: { utilization: 0.8, status: 'allowed_warning', resets_at: 1760000000 } });
  assert.deepEqual(rateLimitStatus([{ type: 'assistant' }]), {});
});

test('utilizationWarning returns a warning at or above the threshold (default 0.8) and null below; it never throws', () => {
  assert.match(utilizationWarning({ seven_day: { utilization: 0.8, status: 'allowed_warning' } }), /seven_day.*80%/);
  assert.equal(utilizationWarning({ seven_day: { utilization: 0.5 } }), null);
  assert.equal(utilizationWarning({}), null);
});
