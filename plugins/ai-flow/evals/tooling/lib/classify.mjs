// Run classification (design D12, U5; user decision 2026-10-16: rate limits are harness errors and stop the runner).
// Harness error = the run never reached a gradeable end state because of the eval infrastructure.
// Case failure = the agent ran and something about the run itself failed (timeout, blocked gate, mock abort).

export const RATE_LIMIT = /rate.?limit|\b429\b|usage limit|overloaded/i;
const HARNESS = [
  [/scaffold failed/i, 'scaffold_failed'],
  [RATE_LIMIT, 'rate_limited'],
  [/auth(entication|orization)?[ _-]?(error|failed)|invalid x-api-key|\b401\b/i, 'auth_error'],
  [/API error/i, 'api_error'],
  [/could not start/i, 'could_not_start'],
  [/mock call budget exceeded/i, 'mock_budget'],
];
const GATE_PROMPT = /\b(approve|approval|gate|proceed\?|continue\?)\b/i;

/** { harness_error, failure_reason } for one CLI run. lastMainText: the final main-thread assistant text. */
export function classifyRun(run, { traceExists, lastMainText = '' } = {}) {
  if (!traceExists) return { harness_error: true, failure_reason: 'no_trace' };
  const text = [run.error, run.aborted?.reason].filter(Boolean).join(' ');
  for (const [re, reason] of HARNESS) if (re.test(text)) return { harness_error: true, failure_reason: reason };
  if (run.aborted) return { harness_error: false, failure_reason: 'mock-abort' };
  if (run.error && /time(d)?\s?out/i.test(run.error)) {
    const blocked = GATE_PROMPT.test(lastMainText) && !/AUTO-APPROVED GATE/.test(lastMainText);
    return { harness_error: false, failure_reason: blocked ? 'blocked-on-gate' : 'timeout' };
  }
  return { harness_error: false, failure_reason: run.error ? 'run-error' : null };
}

/**
 * Runner exit code; precedence 3 (preflight) > 4 (projection, unused since the no-cap decision) > 2 (cost cap)
 * > 5 (harness) > 7 (promotion refused) > 1 (regression) > 0.
 */
export function exitCodeFor({ preflight, projection, costCap, harness, promoteRefused, regression } = {}) {
  if (preflight) return 3;
  if (projection) return 4;
  if (costCap) return 2;
  if (harness) return 5;
  if (promoteRefused) return 7;
  if (regression) return 1;
  return 0;
}
