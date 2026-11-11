# raw/v4.0.0-alpha.2-sonnet

Raw data behind `../../v4.0.0-alpha.2-sonnet.json`, copied by `tooling/promote.mjs`. Local paths are scrubbed.

- `aggregate-result.json` (and any `aggregate-result.resume-<id>.json`): raw CLI output (`claude plugin eval`),
  with prompts trimmed. Its scores and pass flags come from the CLI's own graders at run time; it is not regraded
  when the ai-flow graders change, so it can disagree with the metrics (for example, delegated runs that score 0).
- `metrics.jsonl`: one line per run, graded by the ai-flow analyzers (regraded at $0 when graders change).

Authoritative metrics: `metrics.jsonl` and the baseline `../../v4.0.0-alpha.2-sonnet.json`. Use `aggregate-result.json` only
for the CLI's raw view of a run.
