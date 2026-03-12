# Changelog

## [3.0.0] - 2026-03-12

### Added
- User-invokable commands: `flow-new`, `flow-ff`, `flow-continue` in `commands/`
- `.ai-flow.json` project config for Linear sync settings (team, project, linearSync toggle)
- `hooks/hooks.json` with session-end Linear sync reminder
- `.mcp.json` bundling engram MCP server config
- `CHANGELOG.md`

### Changed
- Skills thinned to delegation wrappers — agents are now the source of truth for phase protocols
- `initializer` agent now creates `.ai-flow.json` during project bootstrap
- `orchestrator` reads `.ai-flow.json` to decide Linear sync behavior (replaces hardcoded sync)
- `linear-sync` reads team/project from `.ai-flow.json` context
- All URLs updated from `lileiva/ai-flow-proposal` to `lileiva/ai-flow`
- Version bumped to 3.0.0

### Removed
- `settings.json` auto-activation of orchestrator agent (now opt-in via `/agents`)

## [2.0.0] - 2026-03-12

### Added
- 10 specialized agents: initializer, explorer, proposer, specifier, designer, planner, implementer, verifier, archivist, debugger
- `linear-sync` agent for Linear issue tracking
- Orchestrator dispatches by agent name with scoped tool access

## [1.0.0] - 2026-03-12

### Added
- Initial Claude Code plugin with marketplace
- 10 flow skills (init, explore, propose, spec, design, plan, apply, verify, archive, debug)
- Orchestrator agent with DAG dependency graph and human review gates
- Shared protocols: engram convention, persistence contract, TDD protocol
