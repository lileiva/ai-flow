# AI-Flow

A unified AI-assisted development workflow plugin for [Claude Code](https://claude.ai/claude-code).

AI-Flow orchestrates structured development through DAG-based phases: exploration, proposal, specification, design, planning, implementation (with TDD), verification, and archival — with human review gates at critical points.

For the full reference document, see [unified-ai-dev-flow.md](unified-ai-dev-flow.md). For version history, see [CHANGELOG.md](CHANGELOG.md).

## Installation

### Prerequisites

- [Claude Code](https://claude.ai/claude-code) v1.0.33+
- [Engram MCP server](https://github.com/anthropics/engram) for artifact persistence (bundled via `.mcp.json`)

### Step 1: Add the marketplace

Open Claude Code and run:

```
/plugin marketplace add lileiva/ai-flow
```

### Step 2: Install the plugin

```
/plugin install ai-flow@ai-flow
```

### Step 3: Initialize your project

```
/flow-init
```

This detects your tech stack, bootstraps persistence, and creates `.ai-flow.json` with your preferences.

### Step 4: Verify

Run `/help` and confirm the `flow-` commands and skills appear.

### Updating

```
/plugin update ai-flow@ai-flow
```

## Quick Start

A typical workflow looks like this:

```
/flow-new add-user-auth      # Explore the problem space, then create a proposal
                              # → You approve or revise the proposal

/flow-spec                    # Write Given/When/Then scenarios
/flow-design                  # Create technical design (can run in parallel with spec)

/flow-plan                    # Break work into batched tasks with TDD steps
                              # → You approve or revise the plan

/flow-apply                   # Execute tasks: tracer bullet first, then batches
                              # → You review after tracer bullet

/flow-verify                  # Run compliance checks and test suite
                              # → You approve or send back for rework

/flow-archive                 # Archive artifacts and close the change
```

Or use the shortcuts:

```
/flow-ff add-user-auth       # Fast-forward: propose → spec + design → plan
/flow-continue add-user-auth  # Resume from the last completed phase
```

## Configuration

AI-Flow uses `.ai-flow.json` at the project root for per-project settings. Created automatically by `/flow-init`.

```json
{}
```

## Commands

User-invokable commands (type directly):

| Command | Description |
|---------|-------------|
| `/flow-new <name>` | Start a new change — explore → propose → human gate |
| `/flow-ff <name>` | Fast-forward — propose → spec + design (parallel) → plan |
| `/flow-continue <name>` | Resume from last completed phase |

## Skills

Model-invoked skills (Claude uses these automatically):

| Skill | Phase | Description |
|-------|-------|-------------|
| `flow-init` | 0 | Bootstrap AI-Flow in your project |
| `flow-explore` | 1 | Brainstorm and explore a problem space |
| `flow-propose` | 2 | Create a formal change proposal |
| `flow-spec` | 3 | Write delta specifications with scenarios |
| `flow-design` | 4 | Create technical design |
| `flow-plan` | 5 | Break down into implementation tasks |
| `flow-apply` | 6 | Execute tasks with TDD and reviews |
| `flow-verify` | 7 | Verify implementation against specs |
| `flow-archive` | 8 | Archive completed change |
| `flow-debug` | Any | Systematic debugging loop |

## Agents

Each phase is executed by a specialized agent with domain expertise and scoped tool access:

| Agent | Phase | Tool Access | Role |
|-------|-------|-------------|------|
| `initializer` | 0 | Read-only | Detects stack, conventions, creates `.ai-flow.json` |
| `explorer` | 1 | Read-only | Brainstorms approaches, investigates codebase |
| `proposer` | 2 | Read-only | Writes formal proposals with risks and rollback |
| `specifier` | 3 | Read-only | Writes Given/When/Then scenarios from requirements |
| `designer` | 4 | Read-only | Architecture decisions, interfaces, testing strategy |
| `planner` | 5 | Read-only | Task breakdown with TDD steps in batches |
| `implementer` | 6 | Full | Writes tests first, then code (RED-GREEN-REFACTOR) |
| `verifier` | 7 | Read + tests | Spec compliance matrix, quality gate |
| `archivist` | 8 | Read + engram | Consolidates artifacts, closes change |
| `debugger` | Any | Full | Root-cause-first investigation with TDD fix |
| `orchestrator` | — | Delegates | Coordinates all agents, manages human gates |

## DAG

```
            proposal
               |
       +-------+-------+
       |               |
     spec           design    <- run in parallel
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

## Hooks

Defined in `plugins/ai-flow/hooks/hooks.json`.

## MCP Servers

The plugin bundles an engram MCP server configuration in `.mcp.json`. This ensures artifact persistence is available without manual setup. The server uses `npx engram-mcp` and scopes the project to the plugin root.

## Human Review Gates

| Gate | After | Options |
|------|-------|---------|
| Proposal approval | Phase 2 | Approve / Revise / Reject |
| Plan approval | Phase 5 | Approve / Revise / Reject |
| Tracer bullet feedback | Phase 6 (batch 0) | Continue / Adjust |
| Verification approval | Phase 7 | Archive / Rework |

## Project Structure

```
plugins/ai-flow/
  .claude-plugin/
    plugin.json              # Plugin metadata (name, version, author)
  .mcp.json                  # Bundled engram MCP server config
  hooks/
    hooks.json               # Session hooks
  commands/
    flow-new.md              # /flow-new command
    flow-ff.md               # /flow-ff command
    flow-continue.md         # /flow-continue command
  skills/
    flow-init/SKILL.md       # Phase 0: Project bootstrap
    flow-explore/SKILL.md    # Phase 1: Problem exploration
    flow-propose/SKILL.md    # Phase 2: Change proposal
    flow-spec/SKILL.md       # Phase 3: Delta specification
    flow-design/SKILL.md     # Phase 4: Technical design
    flow-plan/SKILL.md       # Phase 5: Task planning
    flow-apply/SKILL.md      # Phase 6: TDD implementation
    flow-verify/SKILL.md     # Phase 7: Verification
    flow-archive/SKILL.md    # Phase 8: Archival
    flow-debug/SKILL.md      # Ad-hoc debugging
    _shared/
      engram-convention.md   # Engram topic key naming convention
      persistence-contract.md # Sub-agent context protocol
      tdd-protocol.md        # RED-GREEN-REFACTOR protocol
  agents/
    orchestrator.md          # Coordinator agent
    initializer.md           # Phase 0 agent
    explorer.md              # Phase 1 agent
    proposer.md              # Phase 2 agent
    specifier.md             # Phase 3 agent
    designer.md              # Phase 4 agent
    planner.md               # Phase 5 agent
    implementer.md           # Phase 6 agent
    verifier.md              # Phase 7 agent
    archivist.md             # Phase 8 agent
    debugger.md              # Debug agent
```

## License

MIT
