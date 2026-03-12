# AI-Flow

A unified AI-assisted development workflow plugin for [Claude Code](https://claude.ai/claude-code).

AI-Flow orchestrates structured development through DAG-based phases: exploration, proposal, specification, design, planning, implementation (with TDD), verification, and archival — with human review gates at critical points.

## Installation

### Prerequisites

- [Claude Code](https://claude.ai/claude-code) v1.0.33+ (`claude --version` to check)
- [Engram MCP server](https://github.com/anthropics/engram) for artifact persistence

### Step 1: Add the marketplace

Open Claude Code and run:

```
/plugin marketplace add lileiva/ai-flow-proposal
```

### Step 2: Install the plugin

```
/plugin install ai-flow@ai-flow
```

### Step 3: Verify

Run `/help` and confirm the `ai-flow:` skills appear. Try:

```
/ai-flow:flow-init
```

### Updating

To pull the latest version:

```
/plugin update ai-flow@ai-flow
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

## Agents

Each phase is executed by a specialized agent with domain expertise and scoped tool access:

| Agent | Phase | Tool Access | Role |
|-------|-------|-------------|------|
| `initializer` | 0 | Read-only | Detects stack, conventions, bootstraps persistence |
| `explorer` | 1 | Read-only | Brainstorms approaches, investigates codebase |
| `proposer` | 2 | Read-only | Writes formal proposals with risks and rollback |
| `specifier` | 3 | Read-only | Writes Given/When/Then scenarios from requirements |
| `designer` | 4 | Read-only | Architecture decisions, interfaces, testing strategy |
| `planner` | 5 | Read-only | Task breakdown with TDD steps in batches |
| `implementer` | 6 | Full | Writes tests first, then code (RED-GREEN-REFACTOR) |
| `verifier` | 7 | Read + tests | Spec compliance matrix, quality gate |
| `archivist` | 8 | Read + engram | Consolidates artifacts, closes change |
| `debugger` | Any | Full | Root-cause-first investigation with TDD fix |
| `linear-sync` | Any | Linear MCP | Syncs phase progress to Linear issues |
| `orchestrator` | — | Delegates | Coordinates all agents, manages human gates |

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

## Linear Integration

AI-Flow automatically keeps Linear in sync as you work through phases. The `linear-sync` agent is invoked by the orchestrator after each phase completes.

### What it does

| Phase | Linear action |
|-------|--------------|
| Propose (approved) | Creates parent issue with proposal summary |
| Spec | Posts spec summary as comment |
| Design | Posts design summary as comment |
| Plan (approved) | Creates sub-issues for each task, sets parent to "In Progress" |
| Apply (per batch) | Marks completed task sub-issues as "Done" |
| Verify | Transitions parent issue based on PASS/FAIL verdict |
| Archive | Posts final comment, closes issue |

### Usage

Mention your Linear context when starting a flow:

```
/ai-flow:flow-new add-auth --team Engineering --project Backend
```

Or reference an existing issue:

```
/ai-flow:flow-new add-auth --issue ENG-456
```

The orchestrator captures this and passes it to `linear-sync` throughout the workflow.

### Requirements

- [Linear MCP server](https://modelcontextprotocol.io/integrations/linear) configured in Claude Code
- If Linear is not configured, the plugin works normally — sync is skipped silently

## Human Review Gates

| Gate | After | Options |
|------|-------|---------|
| Proposal approval | Phase 2 | Approve / Revise / Reject |
| Plan approval | Phase 5 | Approve / Revise / Reject |
| Tracer bullet feedback | Phase 6 (batch 0) | Continue / Adjust |
| Verification approval | Phase 7 | Archive / Rework |

## License

MIT
