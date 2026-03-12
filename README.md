# AI-Flow

A unified AI-assisted development workflow plugin for [Claude Code](https://claude.ai/claude-code).

AI-Flow orchestrates structured development through DAG-based phases: exploration, proposal, specification, design, planning, implementation (with TDD), verification, and archival — with human review gates at critical points.

For the full reference document, see [unified-ai-dev-flow.md](unified-ai-dev-flow.md).

## Installation

### Prerequisites

- [Claude Code](https://claude.ai/claude-code) v1.0.33+ (`claude --version` to check)
- [Engram MCP server](https://github.com/anthropics/engram) for artifact persistence
- [Linear MCP server](https://modelcontextprotocol.io/integrations/linear) (optional, for issue tracking)

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
/ai-flow:flow-init
```

This detects your tech stack, bootstraps persistence, and creates `.ai-flow.json` with your preferences (including Linear sync if detected).

### Step 4: Verify

Run `/help` and confirm the `ai-flow:` commands and skills appear.

### Updating

```
/plugin update ai-flow@ai-flow
```

## Configuration

AI-Flow uses `.ai-flow.json` at the project root for per-project settings. Created automatically by `/ai-flow:flow-init`.

```json
{
  "linearSync": true,
  "linear": {
    "team": "Engineering",
    "project": "Backend"
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `linearSync` | boolean | `false` | Enable automatic Linear issue sync after each phase |
| `linear.team` | string | — | Linear team for new issues |
| `linear.project` | string | — | Linear project for new issues |

If the file is missing, Linear sync is off and all other features work normally.

## Commands

User-invokable commands (type directly):

| Command | Description |
|---------|-------------|
| `/ai-flow:flow-new <name>` | Start a new change — explore → propose → human gate |
| `/ai-flow:flow-ff <name>` | Fast-forward — propose → spec + design (parallel) → plan |
| `/ai-flow:flow-continue <name>` | Resume from last completed phase |

## Skills

Model-invoked skills (Claude uses these automatically):

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

When `linearSync: true` in `.ai-flow.json`, the orchestrator automatically dispatches the `linear-sync` agent after each phase:

| Phase | Linear action |
|-------|--------------|
| Propose (approved) | Creates parent issue with proposal summary |
| Spec | Posts spec summary as comment |
| Design | Posts design summary as comment |
| Plan (approved) | Creates sub-issues for each task, sets parent to "In Progress" |
| Apply (per batch) | Marks completed task sub-issues as "Done" |
| Verify | Transitions parent issue based on PASS/FAIL verdict |
| Archive | Posts final comment, closes issue |

## Human Review Gates

| Gate | After | Options |
|------|-------|---------|
| Proposal approval | Phase 2 | Approve / Revise / Reject |
| Plan approval | Phase 5 | Approve / Revise / Reject |
| Tracer bullet feedback | Phase 6 (batch 0) | Continue / Adjust |
| Verification approval | Phase 7 | Archive / Rework |

## License

MIT
