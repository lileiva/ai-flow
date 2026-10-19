# AI-Flow evals

An eval suite for the AI-Flow plugin, run with `claude plugin eval` and graded offline by the Node tooling in `tooling/`. It is not a runtime component: nothing here is loaded when the plugin is used.

## Layout

| Path | What it is |
|---|---|
| `cases/a-…` to `cases/e-…` | The 5 cases. Each has `prompt.md`, `case.yaml`, `scaffold.sh`, advisory `graders/`, and (except e) a hidden `acceptance/` suite. |
| `fixtures/textkit/` | The template repo every case is scaffolded from. `fixtures/scaffold-lib.sh` builds the workspace. |
| `mocks/plugin_engram_engram/` | Suite-level stateful engram mock (same tool names as the real engram). Cases d and e carry their own mocks. |
| `shared/unattended-policy.md` | The auto-approve policy appended to every case prompt. |
| `tooling/` | Runner, analyzers, grading, compare, promote, preflight and the offline self-tests. |
| `baselines/` | Promoted per-model baselines (`v3.4.0-sonnet.json`, later `v3.4.0-opus.json`) and their `raw/` data. In `raw/<name>/`, `aggregate-result.json` is the raw CLI output (CLI graders, not regraded); the authoritative metrics are `metrics.jsonl` and the baseline JSON (see `raw/<name>/README.md`). Local paths are scrubbed on promote. |
| `results/` | Run output (gitignored). |

| Case | Kind | Size | Tags |
|---|---|---|---|
| a: bugfix slugify diacritics | e2e | trivial | smoke |
| b: feature truncateWords | e2e | small | |
| c: feature CSV format/parse | e2e | medium | |
| d: apply phase from seeded artifacts | per-phase | small | smoke |
| e: propose to plan from a seeded exploration, stop at the plan gate | per-phase | small | |

## Prerequisites

1. Claude Code >= 2.1.301, git >= 2.31.
2. Node 26 from nvm (`nvm install 26 && nvm use 26`). The runner prefixes the eval child's `PATH` with the nvm Node 26 `bin/` and `lib/node_modules/npm` dirs (strategy R1 in `tooling/config.json`); the eval sandbox grants read access to `PATH` entries, which is what lets agents run `npm test`. `AIFLOW_EVAL_NODE_DIR` can point at another Node 26 install.
3. `node plugins/ai-flow/evals/tooling/prepare.mjs` once (network): builds `.eval-cache/textkit/node_modules` and `.eval-cache/node26` at the repo root.
4. `node plugins/ai-flow/evals/tooling/preflight.mjs` checks all of the above plus the grading sandbox (`sandbox-exec` on macOS, `bwrap` on Linux) and exits 3 with guidance. It also warns (never fails) when the newest results show high subscription utilization. `preflight.mjs --probe-node` runs one paid haiku probe that checks Node, npm and vitest inside the sandbox.

The runner runs the same preflight before spawning anything.

## Running

```bash
bash plugins/ai-flow/evals/run.sh                       # full suite: 5 cases x 3 runs, sonnet
bash plugins/ai-flow/evals/run.sh --case a --case d     # subset, 1 run each (use --runs N to change)
bash plugins/ai-flow/evals/run.sh --tag smoke           # cases a and d, 1 run each
bash plugins/ai-flow/evals/run.sh --gate                # full suite, 3 runs, harness-error retries, compare with baselines/v3.4.0-<model>.json
bash plugins/ai-flow/evals/run.sh --dry-run             # print the resolved plan, spawn nothing
```

`claude plugin eval` accepts a single `--case` glob and ORs repeated `--tag` values, so the runner sends one case as `--case <id>-*` and several as `--tag case-<id>` each (every case carries its `case-<id>` tag). `--case` combined with `--tag` is resolved locally (both must match).

Other flags: `--model <id>` (or `AIFLOW_EVAL_MODEL`), `--plugin-ref <git ref>` (the plugin is materialized from that ref in a temp worktree, with the current `evals/` overlaid), `--compare <baseline.json>`, `--retry-harness-errors N` (default 2 with `--gate`/`--promote`), `-j N`, `--out <dir>`, `--keep-artifacts`, `--unsafe-host-grading`.

**Cost.** There is no cost cap by default. Cost, tokens and wall time are metrics. `--max-cost-usd X` is forwarded to the CLI as an optional ceiling; if it is reached the summary is marked incomplete (`cost_cap`) and the runner exits 2. With `-j` > 1 more than one in-flight run can overrun the ceiling.

**Rate limits.** A rate-limited run is a harness error. The runner stops, marks the summary incomplete (`rate_limited`) and exits 5; it never retries a rate limit. After the window resets, complete the suite with `--resume <results-dir>` (same selection flags): clean runs are kept and only the missing or harness-error case x run slots are re-run, one `--case <id> --runs <missing>` invocation per case. Output goes to `--out` (default: the resumed dir), `meta.total_cost_usd` adds the prior spend, and `meta.resumed_from` records the source (promoted baselines keep only `meta.resumed: true`). Per-window utilization seen in the traces is recorded in `meta.rate_limit` and printed as a warning at 80% or more.

Output goes to `results/<timestamp>/`: `aggregate-result.json` (CLI), `runs/<case>-<i>.json` (per-run metrics), `summary.json` (per-case mean/stdev), and `compare.json` when comparing.

## Comparing

```bash
node plugins/ai-flow/evals/tooling/compare.mjs --baseline plugins/ai-flow/evals/baselines/v3.4.0-sonnet.json --candidate <results>/summary.json [--markdown] [--json out.json] [--abs-tolerance 0] [--allow-env-mismatch]
```

A metric regresses when it is worse than the baseline mean by more than max(baseline stdev, tolerance). The tolerance is 0.34 for rate metrics (outcome pass rate, TDD score and ratio, phase order, artifact completeness) and `--abs-tolerance` (default 0) otherwise. Cases not run in the candidate show as "not run", and n/a cells are never flagged.

## Baselines

```bash
bash plugins/ai-flow/evals/run.sh --plugin-ref v3.4.0 --promote v3.4.0 [--model opus] [--session-start <file>]
```

`--promote` measures the SessionStart cost with `tooling/measure-session-start.mjs` (4 one-turn runs on temp plugin copies: as shipped, hook made executable, no hooks, empty plugin) unless `--session-start <file>` supplies it. Promotion is refused (exit 7) for a subset or incomplete run, any case with fewer than 3 non-harness-error runs, a missing SessionStart measurement, a `--plugin-ref` other than the version, or plugin files that differ from the tag. Baselines are per model: sonnet for iteration and alpha gates, opus for the final 4.0.0 gate.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | OK |
| 1 | Regression found by compare |
| 2 | Incomplete: the optional `--max-cost-usd` ceiling was reached |
| 3 | Preflight failed, or the baseline to compare with is missing |
| 5 | Harness errors (scaffold, API, auth, rate limit, missing trace, grading unavailable) |
| 6 | compare refused: model or Claude Code major version mismatch |
| 7 | Promotion refused |

Code 4 (cost projection refused) is reserved and unused: the projection was dropped with the cost cap. When several apply, the precedence is 3 > 2 > 5 > 7 > 1 > 0.

## Self-tests

```bash
bash plugins/ai-flow/tests/test_evals_tooling.sh
```

Offline and free: the CLI is replaced by `tooling/test/fixtures/stub-claude.mjs` (`AIFLOW_EVAL_CLAUDE_BIN`).

## Known gaps

- Gates are auto-approved by the unattended policy, which differs from real use.
- Engram is mocked; artifacts are graded from `mem_save` payloads in the trace.
- v3.4.0's SessionStart hook fails with exit 126 on Unix (`run-hook.cmd` is mode 0644), so the as-shipped injection is 0 tokens. The intended cost is measured separately. The fix belongs to a later sub-change, so the measured plugin behaviour is unchanged here.
- Timeouts count as case failures (a property of the plugin), not harness errors.
- Nested subagents are not in the trace (Claude Code 2.1.302 keeps only their `task_*` events). When the main thread delegates the flow to the `ai-flow:orchestrator` agent, phase order is graded on the orchestrator's launches and gates, while TDD, artifact and tool-use grades are n/a ("not observable"). Tokens and cost stay complete (`result.modelUsage`, `task_notification`).
- File writes made through Bash (`>`/`>>`, `tee`, `sed -i`, `cp`/`mv`, scripts calling `writeFileSync`/`open(..., 'w')`) are detected heuristically for the TDD grader; writes through a separate script file are missed. The read-only-write metric still counts Write/Edit/NotebookEdit only.
- Mock recordings (`<results>/mock-recordings/`) are written by the CLI but not replayed; replaying them is a possible future option for cheaper reruns.
