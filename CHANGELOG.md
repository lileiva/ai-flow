# Changelog

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
