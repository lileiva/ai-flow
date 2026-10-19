# Changelog

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
- **"No state found" handling** in `flow-continue` — reconstructs state from individual artifacts or suggests `/flow-new`
- **Standalone debugger fallback** — uses `flow/standalone/debug/` topic key when invoked outside an active flow
- **Exploration check in `flow-ff`** — auto-launches explorer if exploration artifact is missing before proposing
- **Spec-missing flag** in designer — marks design as "produced without spec" during parallel execution so planner can cross-validate
- **OpenSpace MCP integration** (optional) — `search_skills` guidance added to flow-explore, flow-apply, and flow-debug skill files

### Changed
- Initializer agent description corrected — no longer claims "read-only" (it creates `.ai-flow.json`)
- `unified-ai-dev-flow.md` — removed phantom "Reviewer sub-agent" reference from plan phase
- Version bumped to 3.4.0

### Removed
- **Linear sync integration** — removed `linear-sync` agent, all Linear references from orchestrator, commands, initializer, README, and CHANGELOG. Linear was optional (default off) and unused.

## [3.3.0] - 2026-03-24

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
- Engram convention updated with brainstorm artifact type
- Version bumped to 3.3.0

## [3.0.0] - 2026-03-12

### Added
- User-invokable commands: `flow-new`, `flow-ff`, `flow-continue` in `commands/`
- `.mcp.json` bundling engram MCP server config
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
