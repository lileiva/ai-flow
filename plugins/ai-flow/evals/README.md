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
| `baselines/` | Promoted per-model baselines (`v3.4.0-sonnet.json`, `v4.0.0-alpha.2-sonnet.json`, later opus) and their `raw/` data. In `raw/<name>/`, `aggregate-result.json` is the raw CLI output (CLI graders, not regraded); the authoritative metrics are `metrics.jsonl` and the baseline JSON (see `raw/<name>/README.md`). Local paths are scrubbed on promote. |
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
bash plugins/ai-flow/evals/run.sh --gate                # full suite, 3 runs, harness-error retries, compare with the config.gateBaseline baseline
bash plugins/ai-flow/evals/run.sh --dry-run             # print the resolved plan, spawn nothing
```

`claude plugin eval` accepts a single `--case` glob and ORs repeated `--tag` values, so the runner sends one case as `--case <id>-*` and several as `--tag case-<id>` each (every case carries its `case-<id>` tag). `--case` combined with `--tag` is resolved locally (both must match).

Other flags: `--model <id>` (or `AIFLOW_EVAL_MODEL`), `--plugin-ref <git ref>` (the plugin is materialized from that ref in a temp worktree, with the current `evals/` overlaid), `--compare <baseline.json>`, `--retry-harness-errors N` (default 2 with `--gate`/`--promote`), `-j N`, `--out <dir>`, `--keep-artifacts`, `--unsafe-host-grading`, `--allow-env-mismatch` (passed to compare, for a Claude Code patch/minor that differs from the baseline env), `--skip-nested-canary` (skip the nested capture canary; see below).

**Gate baseline.** `--gate` compares with `baselines/<config.gateBaseline[model]>` from `tooling/config.json`, falling back to `gateBaseline.default` (`v3.4.0-{model}.json`). Sonnet gates compare with `v4.0.0-alpha.2-sonnet.json`. `--compare <file>` overrides it; a missing file exits 3.

**Cost.** There is no cost cap by default. Cost, tokens and wall time are metrics. `--max-cost-usd X` is forwarded to the CLI as an optional ceiling; if it is reached the summary is marked incomplete (`cost_cap`) and the runner exits 2. With `-j` > 1 more than one in-flight run can overrun the ceiling.

**Rate limits.** A rate-limited run is a harness error. The runner stops, marks the summary incomplete (`rate_limited`) and exits 5; it never retries a rate limit. After the window resets, complete the suite with `--resume <results-dir>` (same selection flags): clean runs are kept and only the missing or harness-error case x run slots are re-run, one `--case <id> --runs <missing>` invocation per case. Output goes to `--out` (default: the resumed dir), `meta.total_cost_usd` adds the prior spend, and `meta.resumed_from` records the source (promoted baselines keep only `meta.resumed: true`). Per-window utilization seen in the traces is recorded in `meta.rate_limit` and printed as a warning at 80% or more.

Output goes to `results/<timestamp>/`: `aggregate-result.json` (CLI), `runs/<case>-<i>.json` (per-run metrics), `summary.json` (per-case mean/stdev), `traces/<case>-<i>/` (retained run bundle, see Nested capture), `session-start.json` with `--gate`/`--promote`, and `compare.json` when comparing.

## Nested capture

Claude Code writes the main thread to `trace.jsonl` but each subagent (any depth) to its own transcript. Before the kept temp dir is removed, the runner retains a bundle per run in `results/<ts>/traces/<case>-<i>/`: `trace.jsonl`, `subagents/agent-<id>.jsonl` (user and assistant lines only; `session_context` attachments dropped), `subagents/agent-<id>.meta.json`, `mock-calls.jsonl` when the CLI wrote one, and `capture.json`. Every retained file is scrubbed of the home-dir path, the local user name and email addresses; `results/` stays git-ignored. The analyzer merges the transcripts into the main stream (tagged with `agent_depth` and the launching tool_use id), so TDD, artifact, tool-use and phase-order graders see agents at any depth.

`nested_capture.status` per run:

| Status | Meaning |
|---|---|
| `complete` | every expected launch (task_started local agents and Agent/Task tool_uses with a result) has a transcript |
| `partial` | some launches have no transcript; `missing` lists tool_use_id, agent, launcher and depth, and the reason names them |
| `failed` | launches are expected but no transcript loads (no subagents dir, every file unparseable, or a pre-B2b trace) |
| `not_applicable` | the run launched no agents |

An orphan transcript (its `toolUseId` matches no launch) is still merged, attributed by `meta.agentType`, flagged `orphan: true` and listed in `capture.orphans`; status is computed over expected launches only.

When capture blocks a grade, its reason starts with `capture failed:` or `capture partial: missing <agents>` and `na_cause` is `capture` (an n/a that comes from the run itself keeps its own reason and `na_cause: intrinsic`). A partial capture only blocks the grades the missing agent affects: a missing no-write agent leaves TDD and artifacts graded (with `capture_note`), a missing artifact owner (proposer, specifier, designer, planner) makes artifacts n/a, a missing implementer makes TDD n/a; tool-use is n/a under any partial capture. The summary counts capture-caused n/a separately per case (`na_capture {tdd, artifacts, tool_use}`) and counts statuses per case (`nested_capture {complete, partial, failed, not_applicable}`). Promotion refuses any run whose capture is `partial` or `failed`.

Other per-run fields:

- `run_error` (W5): a CLI error is classified. `nested_mock_accounting` when every "mocks: <server>: the harness answered N agent mock calls the trace does not show" clause is matched by mock calls found in the nested transcripts (by input against `mock-calls.jsonl`, else by count) and nothing else is in the error; such a run is not a case failure. Anything else is `unexplained` with a `reason` and keeps `failure_reason: run-error`. The summary counts both per case (`run_errors`).
- `tool_use.self_delegation`: launches where an agent starts another instance of its own type (for example orchestrator -> orchestrator), at any depth, excluding main. n/a under failed capture; lower is better in compare.
- `per_agent_tokens_transcript`: tokens summed from each agent type's transcripts (informational; `per_phase` still comes from `task_notification`).
- `summary.cases[x].runs[]`: per-run detail (run_index, tokens_total, cost_usd, wall_time_s, per_agent_tokens, per_agent_tokens_transcript, max_depth, agents_launched, nested_capture, run_error_class, retried, harness_error). compare prints a per-run block when a case's tokens, cost or time are more than one baseline sd worse, so a single outlier run is visible.
- `meta.observability = {nested_capture: "transcripts", analyzer: "b2b"}`. Comparing with a baseline without it (v3.4.0) prints a note, and fields the baseline lacks show as `n/a (baseline)`, never as regressions.

**Canary.** `--gate` and `--promote` first run `tooling/probe-nested/` (a three-level toy plugin, one haiku run) and require transcripts at depths 1-3, the depth-3 Write in the merged stream and its W5 error reconciled. A failed canary is retried once with a fresh run (the haiku outer agent occasionally does not launch the middle one); the preflight line names the attempt count and each failed attempt's reason. If both attempts fail (e.g. the CLI changed where it writes transcripts) the runner exits 3 before the paid suite. `--skip-nested-canary` skips it with a warning.

**Regrade ($0).** `node plugins/ai-flow/evals/tooling/regrade.mjs <results-dir> [--out <dir>] [--reason <text>]` re-analyzes every run from its retained bundle (legacy flat `traces/<case>-<i>.trace.jsonl` regrade to capture failed, "nested transcripts not retained (pre-B2b trace)"), keeps the outcome and CLI fields, re-classifies `run_error`, and writes `runs/` and `summary.json` to `<results-dir>/regrade` by default. Use it after an analyzer change instead of a paid re-run. The regraded summary keeps `session_start` (including `measured`) and records `meta.regraded_at`, `regrade_reason` and `regraded_from`. To re-promote a baseline from it, run `node plugins/ai-flow/evals/tooling/promote.mjs <results-dir>/regrade/summary.json --version <label>`. All promote guards apply. `metrics.jsonl` comes from the regraded runs, and `aggregate-result.json` and the bundle hashes come from the source dir. The baseline keeps only the source dir's name.

## Comparing

```bash
node plugins/ai-flow/evals/tooling/compare.mjs --baseline plugins/ai-flow/evals/baselines/v3.4.0-sonnet.json --candidate <results>/summary.json [--markdown] [--json out.json] [--abs-tolerance 0] [--allow-env-mismatch]
```

A metric regresses when it is worse than the baseline mean by more than max(baseline stdev, tolerance). The tolerance is 0.34 for rate metrics (outcome pass rate, TDD score and ratio, phase order, artifact completeness) and `--abs-tolerance` (default 0) otherwise. Cases not run in the candidate show as "not run", and n/a cells are never flagged.

## Baselines

```bash
bash plugins/ai-flow/evals/run.sh --plugin-ref v3.4.0 --promote v3.4.0 [--model opus] [--session-start <file>]
```

`--promote <label>` takes a `v<semver>` label; a prerelease label (for example `v4.0.0-alpha.2`) may be promoted from a SHA ref (`--plugin-ref 8029d9b`), as long as the plugin version at that ref equals the label and its behavior hash matches. A release label still needs its tag as the ref. Baselines record `meta.label`, `plugin_ref`, `plugin_sha` and `behavior_hash`; `raw/<label>-<model>/` adds `nested-index.jsonl` (per run: capture, max depth, agents, transcript tokens, self-delegation, bundle hash) within a 1 MB budget.

`--promote` measures the SessionStart cost with `tooling/measure-session-start.mjs` (4 one-turn runs on temp plugin copies: as shipped, hook made executable, no hooks, empty plugin) unless `--session-start <file>` supplies it; `--gate` measures it too. The measurement is kept as `results/<ts>/session-start.json` and `summary.session_start.measured` (`as_shipped.input_delta_tokens`, `first_turn_input_tokens`, method, claude_version, plugin_ref, model, `cost_usd`); its cost is `meta.session_start_cost_usd`, separate from `meta.total_cost_usd`. A failed measurement is recorded as `measured.error`. A value outside the B2 band [2360, 3295] only warns. Promotion is refused (exit 7) for a subset or incomplete run, any case with fewer than 3 non-harness-error runs, a missing or failed SessionStart measurement, a version or behavior hash at `--plugin-ref` that does not match the label, or a run with partial or failed nested capture. Baselines are per model: sonnet for iteration and alpha gates, opus for the final 4.0.0 gate.

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

These tests need `.eval-cache/` (prerequisite 3): run `node plugins/ai-flow/evals/tooling/prepare.mjs` first. Without it, about 47 tests skip with "no .eval-cache (run prepare.mjs)" and the cache-link checks in `git.test.mjs` fail. `bash plugins/ai-flow/tests/run.sh` detects this and prints a note naming `prepare.mjs` next to the summary and floor check.

## Known gaps

- Gates are auto-approved by the unattended policy, which differs from real use.
- Engram is mocked; artifacts are graded from `mem_save` payloads in the trace.
- v3.4.0's SessionStart hook fails with exit 126 on Unix (`run-hook.cmd` is mode 0644), so the as-shipped injection is 0 tokens. The intended cost is measured separately. This is fixed in 4.0.0-alpha.2 (the hook is executable), so alpha.2 runs carry about 2.8k injected tokens that the v3.4.0 baseline lacks.
- Timeouts count as case failures (a property of the plugin), not harness errors.
- Nested capture depends on the CLI transcript layout (`config/projects/<cwd-slug>/<session>/subagents/`, Claude Code 2.1.309). The canary catches a layout change; baselines before v4.0.0-alpha.2 graded delegated runs without nested transcripts (TDD, artifact and tool-use n/a).
- Parallel sibling agents are spliced in launch order, so their interleaving in the merged stream is approximate.
- File writes made through Bash (`>`/`>>`, `tee`, `sed -i`, `cp`/`mv`, scripts calling `writeFileSync`/`open(..., 'w')`) are detected heuristically for the TDD grader; writes through a separate script file are missed. The read-only-write metric still counts Write/Edit/NotebookEdit only.
- Mock recordings (`<results>/mock-recordings/`) are written by the CLI but not replayed; replaying them is a possible future option for cheaper reruns.
