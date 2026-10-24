# Changelog

## [4.0.0-alpha.2] - unreleased

Second pre-release of the 4.0.0 line: hygiene. References resolve, the SessionStart hook runs, TDD and engram-fallback guidance each live in one file, and the docs match the shipped plugin.

### Changed
- **SessionStart hook now runs on Unix.** `hooks/run-hook.cmd` is executable (it failed with exit 126 through 4.0.0-alpha.1), so each session start injects the `using-ai-flow` skill: about 2.8k tokens, where 3.x shipped 0 tokens. Warnings print on real new lines.
- **TDD guide is the single TDD source** (`skills/_shared/tdd-protocol.md`): rationale, the loop, test lists, doubles, legacy code, when TDD does not apply and what replaces it, failure modes. The implementer, debugger, planner, flow-apply and flow-debug point to it; the superpowers TDD complement is no longer referenced.
- **Engram fallback in one file** (`skills/_shared/engram-fallback.md`), referenced by all 11 agents.
- References to shared files use `${CLAUDE_PLUGIN_ROOT}/...`; agents, skills and commands are named `ai-flow:<name>` and `/ai-flow:flow-*`.
- Phase skills carry a self-guard so a phase agent does not re-delegate to itself.
- The initializer writes `testRunner` to `.ai-flow.json`.
- Docs: README fixes (engram is a separate plugin, initializer label, project tree, `.ai-flow.json` schema); `unified-ai-dev-flow.md` moved to `docs/archive/` as v3 history; CHANGELOG backfilled for 3.0.1-3.2.0 with marked corrections.

### Removed
- **skill-sync** (`skills/skill-sync/`, `scripts/sync.sh`) and the grep-only `tests/test_batch*.sh` scripts, replaced by `plugins/ai-flow/tests/run.sh` (validate + node:test structure suite + evals tooling).

### Found
- `plugin.json` `dependencies` is supported by Claude Code, but it means "must be enabled". Both engram and superpowers are optional, so neither is declared; the hook keeps detecting them.

### Notes
- `plugin.json` and both marketplace version fields are 4.0.0-alpha.2. The alpha stays on the `v4/*` branch; `main` stays on 3.4.0 until 4.0.0.
- A user-level `~/.claude/CLAUDE.md` that still says "Read and follow `skills/flow-x/SKILL.md`" predates the `${CLAUDE_PLUGIN_ROOT}` references; it is outside the plugin and is not changed here.

### Eval comparison
Gate at `8029d9b` (sonnet, Claude Code 2.1.304, 2026-10-20), 5 cases x 3 runs vs `v3.4.0-sonnet.json` (2.1.302; patch-only CLI difference, compared with `--allow-env-mismatch`). 15/15 runs without harness errors, not rate-limited; notional cost $16.57 (subscription).

No blocking regression. Outcome pass rate is 1.0 on every case. TDD is 1.0 (score and ratio) on case d, the per-phase apply case, same as the baseline. Subagent questions and read-only-agent writes are 0 wherever observable.

| Case | Outcome | TDD (score / ratio) | Phase order | Delegated to orchestrator | Artifacts | Tokens | Wall time (s) |
|---|---|---|---|---|---|---|---|
| a bugfix | 1.0 (1.0) | n/a (baseline 1.0) | 0.33 (0) | 3/3 (1/3) | n/a (1.0) | 2.11M (1.96M) | 568 (478) |
| b small feature | 1.0 (1.0) | n/a (baseline 1.0) | 0 (0) | 3/3 (2/3) | n/a (1.0) | 1.95M (2.03M) | 472 (467) |
| c medium feature | 1.0 (1.0) | n/a (baseline 0.5 / 0.875) | 0 (0) | 3/3 (1/3) | n/a (1.0) | 2.60M (2.26M) | 676 (686) |
| d apply (seeded) | 1.0 (1.0) | 1.0 / 1.0 (1.0 / 1.0) | 1.0 (1.0) | - | n/a | 0.36M (0.31M) | 41 (40) |
| e propose+plan (seeded) | 1.0 (1.0) | n/a | 0.67 (1.0) | - | 1.0 (1.0) | 0.75M (0.69M) | 225 (186) |

Baseline values in parentheses.

- **SessionStart now runs.** The hook succeeded (exit 0) in all 15 runs. Measured at `8029d9b`, it adds 2,890 first-turn input tokens (intended hook cost 2,893; always-on plugin cost 1,813). In 3.x it added 0 tokens because the hook failed with exit 126. This increase is intended.
- **The main thread now delegates every end-to-end run.** With `using-ai-flow` injected, all 9 runs of cases a-c handed the flow to `ai-flow:orchestrator`; the baseline did this in 4 of 9. The phase agents then run nested, outside the trace. So TDD, artifact and tool-use grades for a-c are n/a (not observable), not regressions. Their CLI `run-error` comes from nested mock accounting ("agent mock calls the trace does not show"), not from an outcome failure. Case d remains the TDD signal.
- **Gates.** The orchestrator now prints gate markers in end-to-end runs: 4 of 9 runs printed all four gates, against 0 in the baseline. In non-interactive runs it still launches the next phase before the gate is answered, so only run 1 of case a passes phase order. On case e, run 0 printed the proposal gate late (0.67 vs 1.0); phase order is not a blocking metric.
- **No self-delegation.** No `ai-flow:<X>` agent launched another `ai-flow:<X>` in any of the 15 traces.
- **Tokens, cost and time (informational).** The deltas come from four sources:
  - SessionStart injection: +11k main-thread tokens on d and +53k on e;
  - delegation: main-thread tokens fall by 154k-302k on a-c, while the orchestrator rises by 25k on a and c;
  - the TDD guide read and two implementer launches per e2e run: implementer +4k on d and +15k to +36k on a-c.

  Total tokens are within one baseline sd on a, b, c and e, and +18% on d (above one sd). Cost on a (+$0.19) and wall time on a and e are also above one sd.

### Evals tooling (B2b)
Evals-only change: the plugin runtime is byte-identical to `8029d9b` (behavior hash `a8db88f8...`, guarded by `tests/structure/runtime-frozen.test.mjs`).

- **Nested capture.** The runner keeps each run's subagent transcripts (any depth) as a scrubbed bundle in `results/<ts>/traces/<case>-<i>/` and merges them into the graded stream, so TDD, artifact, tool-use and phase-order grades are observable in delegated runs. Each run reports `nested_capture.status` (`complete`, `partial`, `failed`, `not_applicable`). An n/a caused by capture says `capture failed:` / `capture partial: missing <agents>` (`na_cause: capture`), and the summary counts capture-caused n/a apart from intrinsic n/a. Deviation from the spec (R6): an orphan transcript is attributed via its `meta.agentType` and flagged `orphan`, not counted as unknown.
- **New metrics.** `tool_use.self_delegation` at any depth; W5 `run_error` classes (`nested_mock_accounting` or `unexplained`); `per_agent_tokens_transcript`; per-run detail in `summary.cases[x].runs[]`, and compare prints a per-run block for an outlier; `meta.observability`. Fields a baseline lacks compare as `n/a (baseline)`.
- **SessionStart measured on `--gate`.** The result is saved as `session-start.json` and `summary.session_start.measured`. Its cost (`meta.session_start_cost_usd`) is kept apart from the suite cost.
- **Promotion.** Alpha labels can now be promoted from a SHA ref: the version and behavior hash at that ref must match the label. A run with partial or failed capture blocks promotion. The raw data adds `nested-index.jsonl`, within a 1 MB budget.
- **Gate tooling.** The gate baseline comes from `config.gateBaseline`; sonnet now uses `v4.0.0-alpha.2-sonnet.json`. A haiku nested-capture canary runs before `--gate`/`--promote` (`--skip-nested-canary` skips it), and `--allow-env-mismatch` is passed through. A failed canary is retried once with a fresh run before the runner exits 3, and every attempt is reported. `regrade.mjs` regrades a results dir for $0, including W5 run-errors. It keeps `session_start.measured` and records `meta.regraded_at`, `regrade_reason` and `regraded_from`, so `promote.mjs` can promote the regrade dir directly with the same guards. The TDD and phase-work graders no longer count backup or temp files (`*.bak`, `*.orig`, `*.rej`, `*~`, `*.swp`, `.#*`) as implementation or test files. The Bash-write heuristic now also detects in-place edits with a backup suffix (`sed -i.bak`, `sed -i'.bak'`, `sed --in-place=SUFFIX`, `perl -pi`, `perl -i.bak`); before, only `sed -i`, `sed -i ''` and `sed --in-place` counted. The backup file itself is still neither an implementation nor a test file.
- **Tests.** `tests/run.sh` floor raised to 790 executed tests, and each B2b check has a seeded negative in the discrimination map. When `.eval-cache/` is missing, or evals tests skip for it (about 47 on a fresh clone, plus failing cache-link checks in `git.test.mjs`), `run.sh` prints a note telling you to run `node plugins/ai-flow/evals/tooling/prepare.mjs` first. The prerequisite is documented in the README and `evals/README.md`.

**Re-run of the alpha.2 gate with nested capture.** Setup: `8029d9b`, sonnet, Claude Code 2.1.309, 2026-10-23, 5 cases x 3 runs, compared with `v3.4.0-sonnet.json` (2.1.302; patch-only difference, run with `--allow-env-mismatch`). Every run completed: 15/15, no harness errors, no retries, not rate-limited. Nested capture was complete in 15/15 runs (max depth 2 on a-c; no debugger was launched). Cost: $16.27 for the suite, plus $0.13 for the SessionStart measurement, about $0.03 for three canary runs, and $1.41 for the Batch 0 tracer. The first canary attempt failed: haiku's outer agent did not launch the middle agent, so only depth 1 was found. A manual re-run and the gate's own canary then passed at depths 1-3, which shows the canary can be flaky (it now retries once). The result was promoted as `baselines/v4.0.0-alpha.2-sonnet.json` and then re-promoted from a $0 regrade with the fixed graders (see below). The table shows the regraded values.

| Case | Outcome | TDD (score / ratio) | Phase order | Artifacts | Tokens | Wall time (s) | W5 run_error |
|---|---|---|---|---|---|---|---|
| a bugfix | 1.0 (1.0) | 0.33 / 0.67 (1.0 / 1.0) | 0.33 (0) | 0.92 (1.0) | 2.15M (1.96M) | 581 (478) | 3 nested_mock_accounting |
| b small feature | 1.0 (1.0) | 0.67 / 0.83 (1.0 / 1.0) | 1.0 (0) | 1.0 (1.0) | 2.03M (2.03M) | 470 (467) | 3 nested_mock_accounting |
| c medium feature | 0.67 (1.0) | 1.0 / 1.0 (0.5 / 0.875) | 1.0 (0) | 1.0 (1.0) | 2.28M (2.26M) | 590 (686) | 3 nested_mock_accounting (live: 1 + 2 unexplained, see below) |
| d apply (seeded) | 1.0 (1.0) | 0.33 / 0.56 (1.0 / 1.0) | 1.0 (1.0) | n/a | 0.43M (0.31M) | 45 (40) | none |
| e propose+plan (seeded) | 1.0 (1.0) | n/a | 1.0 (1.0) | 1.0 (1.0) | 0.88M (0.69M) | 263 (186) | none |

Baseline values in parentheses. The v3.4.0 TDD values for a-c come from its non-delegated runs, so they are not like-for-like with these grades.

- **TDD in delegated runs is now visible.** It was n/a in the first alpha.2 gate. Every a-c run launches the implementer twice. The first instance was test-first with red before green in 9/9 runs; the second in 6/9. The three failures (a-0, a-1, b-2) are the second instance writing a test and then the implementation with no failing run in between, or editing first. On d (one implementer, several tasks) 1/3 runs passed: the later task in the same instance skipped red. This supports the hypothesis that red is skipped on later batches and tasks. In the live grade, a-0's second instance was blamed for editing `src/slugify.js.bak`, a backup left by a `sed -i.bak` mutation check. The regraded reason is that no test failed between its test write and `src/slugify.js`, so the result stays 6/9.
- **Compare reports 23 regressions after the regrade (24 live).** None of them are outcome regressions. The quality rows are a `tdd_score` and d `tdd_score`/`tdd_ratio` (a `tdd_ratio` went from 0.61 to 0.67 and is no longer flagged). They are measurement changes: a's baseline grade came from non-delegated runs, and d dropped from 1.0. The other rows are informational token, cost and time rows. On d, per-run tokens were 308k, 548k and 445k, so the 548k run drives the mean above one sd. Main-thread and spec/plan token rises on e add to this. Phase order improved on b and c, because the orchestrator chain is now graded (D5) and repeated gate markers are counted once.
- **c-0 outcome failed.** The acceptance suite failed (3/7 passed; visible tests 43/55). This is a real case failure, not a harness error or a W5 artifact, and B4 verify should examine it.
- **W5 run-errors.** The live gate classified c-0 and c-2 as `unexplained` (36 reported / 35 found, and 44 / 43). The cause is that the CLI records a mock input over 16,384 chars as a truncated string ending `…[truncated]`. This was fixed after the promotion (`fix(evals): W5 matches a mock input the CLI recorded truncated`): a $0 regrade of the same results dir now classifies all 9 W5 runs as `nested_mock_accounting`, and c-0/c-2 `failure_reason` moves from `run-error` to null.
- **Self-delegation** is 0 in all 15 runs, and subagent questions and read-only-agent writes are 0 everywhere.
- **SessionStart** is measured at `8029d9b` as 2,887 input-delta tokens (hook exit 0, inside the B2 band [2360, 3295]).
- **Determinism.** A $0 regrade of the gate results dir with the gate's evals (`0e99981`) reproduces every graded field and the per-case summary exactly.
- **Regrade and re-promotion.** After the promotion, the gate results were regraded at $0 with the W5 truncated-input fix and the backup-file fix, then re-promoted from the regrade dir. Guards: label vs `plugin.json` at `8029d9b`, behavior hash, 15/15 complete capture, and `session_start.measured`. The baseline records `meta.regraded_at`, `regrade_reason` and `regraded_from: b2b-alpha2-gate`. Per-run changes: a-0 TDD ratio 0.33 to 0.50 (still fail), and c-0 and c-2 W5 `unexplained` to `nested_mock_accounting`. Every other graded field is unchanged. `aggregate-result.json` and `nested-index.jsonl` in `raw/` are unchanged, and only `metrics.jsonl` moved. A second $0 regrade, after the `sed`/`perl` in-place fix, changed no per-run or per-case grade. The four in-place edits it newly detects (a-0 `sed -i.b` and `sed -i.bak`, a-2 `sed -i.orig`, a-1 `perl -i`) are mutation checks or re-edits of files that the same implementer instance had already written. The re-promoted baseline differs only in `meta.regraded_at` and `regrade_reason`, and `raw/` is unchanged.

## [4.0.0-alpha.1] - unreleased

First pre-release of the 4.0.0 line. It adds an eval suite only: no changes to agents, skills, commands or hooks, so the plugin behaves exactly like 3.4.0.

### Added
- **Eval suite** (`plugins/ai-flow/evals/`): 5 cases (3 end-to-end, 2 per-phase with seeded artifacts) run through `claude plugin eval` and graded offline from traces and workspaces: hidden acceptance tests, TDD adherence, phase order and gates, artifact completeness, subagent questions, read-only agent writes, tokens per phase, cost and wall time.
- **Runner** `plugins/ai-flow/evals/run.sh` with subsets (`--case`, `--tag smoke`), `--gate`, `--compare`, `--promote`, `--dry-run`, harness-error retries and a full preflight. No cost cap by default; `--max-cost-usd` is an optional pass-through. Rate-limited runs stop the runner.
- **compare** (regression = worse than 1 baseline stdev, at least 0.34 for rate metrics) and **promote** (per-model baselines `v3.4.0-sonnet.json` / `v3.4.0-opus.json`; refuses incomplete data with exit 7).
- **SessionStart measurement** (`measure-session-start.mjs`): as-shipped vs intended hook cost on temp plugin copies.
- Offline self-tests: `bash plugins/ai-flow/tests/test_evals_tooling.sh`.

### Found
- **The 3.x SessionStart hook never runs on Unix.** `hooks/run-hook.cmd` is committed as mode 0644, so Claude Code gets exit 126 (Permission denied) and the bootstrap injection is 0 tokens (intended cost measured on sonnet: about 2.8k hook tokens, 2,777 and 2,865 in two measurements; always-on plugin cost about 1.9k). The evals record this as-shipped value next to the intended cost. The fix is deferred to a later 4.0.0 sub-change so the baseline measures 3.4.0 as shipped.
- **Delegated orchestration on Claude Code 2.1.302.** In 4 of 9 end-to-end baseline runs the main thread handed the whole flow to the `ai-flow:orchestrator` agent, which launched the phase agents as nested subagents. Nested subagents are not in the trace, so TDD, artifact and tool-use grades for those runs are recorded as n/a (not observable), and phase order is graded on the orchestrator's own launches.
- **No end-to-end run passes the phase/gate check.** Runs that keep the orchestrator on the main thread never print the tracer gate, and delegated runs print no gate markers before launching the next phase (phase order 0/9 on cases a-c; 6/6 on the per-phase cases d and e).
- Agents often edit files with Bash (heredocs, `sed -i`, scripts) rather than Write/Edit; the TDD grader counts those writes.

### Baseline
`plugins/ai-flow/evals/baselines/v3.4.0-sonnet.json` (plugin files of tag v3.4.0, sonnet, Claude Code 2.1.302, 2026-10-18): 15/15 runs without harness errors, n=3 per case, outcome pass rate 1.0 on every case, notional cost $15.61 for the suite (subscription; no cost cap). Mean ± sd per case:

| Case | Tokens | Cost (USD) | Wall time (s) | TDD pass (applicable runs) | Phase order | Artifacts |
|---|---|---|---|---|---|---|
| a bugfix | 1.96M ± 0.27M | 1.35 ± 0.12 | 478 ± 41 | 1.0 (2/3) | 0 | 1.0 (2/3) |
| b small feature | 2.03M ± 0.36M | 1.39 ± 0.23 | 467 ± 56 | 1.0 (1/3) | 0 | 1.0 (1/3) |
| c medium feature | 2.26M ± 0.39M | 1.71 ± 0.25 | 686 ± 84 | 0.5, ratio 0.875 (2/3) | 0 | 1.0 (2/3) |
| d apply (seeded) | 0.31M ± 0.04M | 0.17 ± 0.01 | 40 ± 3 | 1.0 | 1.0 | n/a |
| e propose+plan (seeded) | 0.69M ± 0.06M | 0.58 ± 0.02 | 186 ± 14 | n/a | 1.0 | 1.0 |

Subagent AskUserQuestion attempts and read-only-agent writes were 0 in every observable run. Seven-day subscription utilization went from 0.89 to 0.93 over the suite.

### Requirements (evals only)
- Node 26 from nvm (`nvm install 26`), Claude Code >= 2.1.301, git >= 2.31, and a one-time `node plugins/ai-flow/evals/tooling/prepare.mjs`.

### Notes
- `plugin.json` and the marketplace entry are both 4.0.0-alpha.1 on the `v4/*` branch. Alphas live on that branch and are not merged; `main` stays on 3.4.0 until 4.0.0. (A marketplace entry that disagrees with plugin.json is ignored at install time, and `claude plugin tag` refuses it, so the versions are kept in sync.)

## [3.4.0] - 2026-04-14

### Added
- **Auto-verify enforcement** — orchestrator auto-launches `/flow-verify` after final apply batch; verification is no longer skippable
- **DAG state updates** — orchestrator saves state to engram after every phase transition, enabling reliable `flow-continue` recovery
- **Batch scoping** in implementer agent — agents now execute only the specified batch instead of the full plan
- **Proposal approval guard** in specifier — blocks spec creation if proposal is still draft/pending
- **Self-review step** in implementer — two-stage spec compliance + code quality check before each commit
- **Rework protocol** in orchestrator — concrete steps for handling verification failures at the rework gate
- **Test discovery** in TDD protocol — agents auto-detect test runner from project config before first RED step
- **AskUserQuestion fallback** — explorer and proposer degrade to text-based Q&A when superpowers unavailable

> Correction (4.0.0-alpha.2): the fallback triggers when the `AskUserQuestion` tool is unavailable. It has nothing to do with superpowers, which does not provide that tool.
- **"No state found" handling** in `flow-continue` — reconstructs state from individual artifacts or suggests `/flow-new`
- **Standalone debugger fallback** — uses `flow/standalone/debug/` topic key when invoked outside an active flow
- **Exploration check in `flow-ff`** — auto-launches explorer if exploration artifact is missing before proposing
- **Spec-missing flag** in designer — marks design as "produced without spec" during parallel execution so planner can cross-validate
- **OpenSpace MCP integration** (optional) — `search_skills` guidance added to flow-explore, flow-apply, and flow-debug skill files

### Changed
- Initializer agent description corrected — no longer claims "read-only" (it creates `.ai-flow.json`)
- `unified-ai-dev-flow.md` — removed phantom "Reviewer sub-agent" reference from plan phase
- Version bumped to 3.4.0

> Correction (4.0.0-alpha.2): only the initializer's frontmatter description was fixed. The README agents table and the orchestrator's agents table still labelled the initializer "Read-only" until 4.0.0-alpha.2.

> Correction (4.0.0-alpha.2): the reviewer sub-agent references were not removed. `unified-ai-dev-flow.md` still described a plan "review loop with a reviewer sub-agent" and "Reviewer sub-agents" in the apply phase; both were fixed when the document was archived in 4.0.0-alpha.2.

> Correction (4.0.0-alpha.2): the marketplace entry (`.claude-plugin/marketplace.json`) still said 3.3.0 at the v3.4.0 tag; only `plugin.json` was bumped.

### Removed
- **Linear sync integration** — removed `linear-sync` agent, all Linear references from orchestrator, commands, initializer, README, and CHANGELOG. Linear was optional (default off) and unused.

## [3.3.0] - 2026-03-24

No git tag exists for this release (commit b9c5697).

### Added
- **SessionStart hook** with bootstrapper injection and peer dependency detection (engram, superpowers)
- **`using-ai-flow` bootstrapper skill** — single entry point with instruction priority, flow commands, dependency graph, auto-invoke rules
- **Cross-platform `run-hook.cmd`** wrapper for Unix and Windows (Git Bash) environments
- **Iterative discovery loop** in explorer agent — hybrid approach: structured AskUserQuestion first round, then up to 3 free-form refinement rounds with readiness gate
- **Brainstorm artifact** (`flow/{change-name}/brainstorm`) as separate explorer output, optional proposer input
- **Skill creation detection** in orchestrator — suggests `skill-creator` when reusable patterns found
- **Engram `none` fallback mode** in persistence contract — inline-only artifacts when engram unavailable
- **Skill-sync system** (`skill-sync` skill + `sync.sh`) — auto-generates agent rules from skill metadata frontmatter
- **Metadata frontmatter** (`scope`, `auto_invoke`) on all 12 skill SKILL.md files
- **Conditional superpowers references** ("Ecosystem Enhancement" appendix) in 5 agents: explorer, implementer, debugger, verifier, orchestrator
- **Identity inheritance** from project's AGENTS.md in orchestrator
- **Git worktree suggestion** for apply phases in orchestrator

### Changed
- Explorer agent now produces brainstorm artifact alongside exploration artifact
- Proposer agent reads brainstorm artifact as optional enrichment input
- Orchestrator tracks brainstorm in artifact table and passes it to proposer
- All 9 agent files include engram fallback notes for graceful degradation

> Correction (4.0.0-alpha.2): 10 of the 12 agents at the time carried the note; the initializer and linear-sync did not. All 11 current agents point to `skills/_shared/engram-fallback.md` since 4.0.0-alpha.2.
- Engram convention updated with brainstorm artifact type
- Version bumped to 3.3.0

## [3.2.0] - 2026-03-23

### Added
- **Connected Pairs registry** in the planner: tasks that introduce a new layer connection get a tracer sub-step (a thin connectivity proof) before the behaviour sub-step.
- The implementer runs each sub-step as its own TDD cycle; `flow-plan` and `unified-ai-dev-flow.md` describe the registry.

### Notes
- `plugin.json` only; the marketplace entry stayed at 3.0.3.

## [3.1.0] - 2026-03-23

### Added
- **Interactive `AskUserQuestion`** in the explorer and proposer: structured, selectable questions to gather requirements and validate scope before working. `flow-explore`, `flow-propose`, `flow-new` and `flow-ff` updated to match.

### Notes
- `plugin.json` only; the marketplace entry stayed at 3.0.3.

## [3.0.4] - 2026-03-13

### Removed
- The Linear-sync `Stop` hook (`hooks/hooks.json` is now empty).

### Notes
- No git tag. `plugin.json` only; the marketplace entry stayed at 3.0.3.

## [3.0.3] - 2026-03-12

### Changed
- The Linear-sync `Stop` hook became a command hook: exit 2 blocks with the message on stderr, `stop_hook_active` prevents loops, and a `.ai-flow-sync-needed` sentinel (set by the orchestrator, cleared by linear-sync) tracks pending syncs.

### Notes
- No git tag.

## [3.0.2] - 2026-03-12

### Changed
- The `Stop` prompt hook uses natural language instead of explicit JSON (works around anthropics/claude-code#11947) and pins the hook model to sonnet.

### Removed
- The bundled engram MCP server: `.mcp.json` is empty and persistence comes from the separate engram plugin (`plugin:engram:engram`).

### Notes
- No git tag.

## [3.0.1] - 2026-03-12

### Fixed
- The `Stop` prompt hook returns `{ok, reason}` as the hooks spec requires, instead of `{message}`.

### Notes
- No git tag.

## [3.0.0] - 2026-03-12

### Added
- User-invokable commands: `flow-new`, `flow-ff`, `flow-continue` in `commands/`
- `.mcp.json` bundling engram MCP server config (removed in 3.0.2)
- `CHANGELOG.md`

### Changed
- Skills thinned to delegation wrappers — agents are now the source of truth for phase protocols
- `initializer` agent now creates `.ai-flow.json` during project bootstrap
- All URLs updated from `lileiva/ai-flow-proposal` to `lileiva/ai-flow`
- Version bumped to 3.0.0

### Removed
- `settings.json` auto-activation of orchestrator agent (now opt-in via `/agents`)

## [2.0.0] - 2026-03-12

### Added
- 10 specialized agents: initializer, explorer, proposer, specifier, designer, planner, implementer, verifier, archivist, debugger
- Orchestrator dispatches by agent name with scoped tool access

## [1.0.0] - 2026-03-12

### Added
- Initial Claude Code plugin with marketplace
- 10 flow skills (init, explore, propose, spec, design, plan, apply, verify, archive, debug)
- Orchestrator agent with DAG dependency graph and human review gates
- Shared protocols: engram convention, persistence contract, TDD protocol
