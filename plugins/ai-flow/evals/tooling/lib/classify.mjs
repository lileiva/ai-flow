// Run classification (design D12, U5; user decision 2026-10-16: rate limits are harness errors and stop the runner).
// Harness error = the run never reached a gradeable end state because of the eval infrastructure.
// Case failure = the agent ran and something about the run itself failed (timeout, blocked gate, mock abort).
import { scrubEmails, scrubLocalPaths } from './scrub.mjs';

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

const MOCK_CLAUSE = /mocks: (\S+): the harness answered (\d+) agent mock calls? the trace does not show(?: \([^)]*\))?/g;

/**
 * W5 (B2b D7, REQ-008): { message (scrubbed), class, details, reason } of a CLI run-error. nested_mock_accounting
 * when every "mocks: <server>: the harness answered N agent mock calls the trace does not show" clause reconciles
 * with the nested transcripts (analysis.mock_accounting: the N unseen mock calls are found there by input, or,
 * without mock-calls.jsonl, at least N transcript-only calls to that server) and nothing else is in the error;
 * unexplained otherwise (with the reason).
 */
export function classifyRunError(error, analysis = {}) {
  const message = scrubEmails(scrubLocalPaths(error));
  const unexplained = (reason, details = null) => ({ message, class: 'unexplained', details, reason });
  const clauses = [...error.matchAll(MOCK_CLAUSE)];
  if (!clauses.length) return unexplained('not a nested mock accounting error');
  if (analysis.nested_capture?.status === 'failed') return unexplained('capture failed: the unseen mock calls cannot be looked for in nested transcripts');
  const details = clauses.map(([, server, n]) => {
    const acc = analysis.mock_accounting?.[server] ?? {};
    const reported = Number(n);
    if (acc.mock_calls == null) return { server, reported, unseen: null, found_in_transcripts: acc.transcript_only ?? 0, method: 'count', ok: (acc.transcript_only ?? 0) >= reported };
    return { server, reported, unseen: acc.unseen, found_in_transcripts: acc.found_in_transcripts, method: 'mock-calls', ok: acc.unseen === reported && acc.found_in_transcripts === reported };
  });
  const shown = details.map(({ ok, ...d }) => d);
  const detail = shown.length === 1 ? shown[0] : { clauses: shown };
  const bad = details.filter((d) => !d.ok);
  if (bad.length) return unexplained(bad.map((d) => `${d.server}: reported ${d.reported}, found ${d.found_in_transcripts} in nested transcripts`).join('; '), detail);
  if (error.replace(MOCK_CLAUSE, '').replace(/[\s;,.]+/g, '')) return unexplained('other error text besides the reconciled mock accounting', detail);
  return { message, class: 'nested_mock_accounting', details: detail, reason: null };
}

/**
 * { harness_error, failure_reason } for one CLI run. lastMainText: the final main-thread assistant text.
 * With an `analysis` (B2b D7), a run that carries a CLI error also gets run_error (classifyRunError).
 */
export function classifyRun(run, opts = {}) {
  const res = classifyBase(run, opts);
  if (!('analysis' in opts) || !run.error) return res;
  const runError = classifyRunError(run.error, opts.analysis ?? {});
  // An explained W5 error is not a case failure: the calls happened, the trace just does not show nested agents.
  const failureReason = runError.class === 'nested_mock_accounting' && res.failure_reason === 'run-error' ? null : res.failure_reason;
  return { ...res, failure_reason: failureReason, run_error: runError };
}

function classifyBase(run, { traceExists, lastMainText = '' } = {}) {
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
