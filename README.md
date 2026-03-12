# AI-Flow

A unified AI-assisted development workflow plugin for [Claude Code](https://claude.ai/claude-code).

AI-Flow orchestrates structured development through DAG-based phases: exploration, proposal, specification, design, planning, implementation (with TDD), verification, and archival — with human review gates at critical points.

## Install

Requires Claude Code v1.0.33+.

### 1. Add the marketplace

```
/plugin marketplace add lileiva/ai-flow-proposal
```

### 2. Install the plugin

```
/plugin install ai-flow@ai-flow
```

## Skills

Once installed, all skills are namespaced under `ai-flow:`:

| Skill | Phase | Description |
|-------|-------|-------------|
| `/ai-flow:flow-init` | 0 | Bootstrap AI-Flow in your project |
| `/ai-flow:flow-explore` | 1 | Brainstorm and explore a problem space |
| `/ai-flow:flow-propose` | 2 | Create a formal change proposal |
| `/ai-flow:flow-spec` | 3 | Write delta specifications with scenarios |
| `/ai-flow:flow-design` | 4 | Create technical design |
| `/ai-flow:flow-plan` | 5 | Break down into implementation tasks |
| `/ai-flow:flow-apply` | 6 | Execute tasks with TDD and reviews |
| `/ai-flow:flow-verify` | 7 | Verify implementation against specs |
| `/ai-flow:flow-archive` | 8 | Archive completed change |
| `/ai-flow:flow-debug` | Any | Systematic debugging loop |

### Meta-commands

These are handled by the orchestrator agent:

- **`/ai-flow:flow-new <name>`** — Runs explore → propose → human gate
- **`/ai-flow:flow-ff <name>`** — Fast-forward: propose → spec + design (parallel) → plan
- **`/ai-flow:flow-continue <name>`** — Resume from last completed phase

## DAG

```
            proposal
               |
       +-------+-------+
       |               |
     spec           design    ← run in parallel
       |               |
       +-------+-------+
               |
             plan
               |
             apply
               |
            verify
               |
           archive
```

## Human Review Gates

| Gate | After | Options |
|------|-------|---------|
| Proposal approval | Phase 2 | Approve / Revise / Reject |
| Plan approval | Phase 5 | Approve / Revise / Reject |
| Tracer bullet feedback | Phase 6 (batch 0) | Continue / Adjust |
| Verification approval | Phase 7 | Archive / Rework |

## Prerequisites

- [Claude Code](https://claude.ai/claude-code) v1.0.33+
- [Engram MCP server](https://github.com/anthropics/engram) for artifact persistence

## License

MIT
