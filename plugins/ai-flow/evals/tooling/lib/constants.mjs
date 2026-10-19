// Commands documented in the README (REQ-018). Tests run them verbatim, so the docs cannot drift.

export const BASELINE_SONNET = 'plugins/ai-flow/evals/baselines/v3.4.0-sonnet.json';

/** compare.mjs invocation comparing `candidate` against `baseline` (paths relative to the repo root or absolute). */
export const compareCommand = (baseline, candidate = baseline) => `node plugins/ai-flow/evals/tooling/compare.mjs --baseline ${baseline} --candidate ${candidate}`;

/** The README's "compare against the baseline" command, shown comparing the committed baseline with itself. */
export const README_COMPARE_CMD = compareCommand(BASELINE_SONNET);
