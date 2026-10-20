---
name: using-ai-flow
description: >
  Entry point for AI-Flow sessions. Establishes workflow awareness,
  commands, auto-invoke rules, and agent mapping.
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke:
    - "Starting any AI-Flow conversation"
    - "Running ai-flow commands"
---

<SUBAGENT-STOP>
If you were dispatched as a sub-agent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

## Instruction Priority

AI-Flow skills override default system prompt behavior, but **user instructions always take precedence**:

1. **User's explicit instructions** (CLAUDE.md, AGENTS.md, direct requests) -- highest priority
2. **AI-Flow skills** -- override default system behavior where they conflict
3. **Default system prompt** -- lowest priority

If CLAUDE.md says "don't use TDD" and a skill says "always use TDD," follow the user's instructions. The user is in control.

## How to Access Skills

**In Claude Code:** Use the `Skill` tool. When you invoke a skill, its content is loaded and presented to you -- follow it directly. Never use the Read tool on skill files.

**In other environments:** Check your platform's documentation for how skills are loaded.

## AI-Flow Development Workflow

AI-Flow is an 8-phase workflow for planning and implementing changes with rigor. Each phase is handled by a specialized sub-agent. The **orchestrator** (`ai-flow:orchestrator` agent) coordinates the flow -- you NEVER run phase work inline.

### The 8 Phases

| Phase | What | Skill |
|-------|------|-------|
| 1. Explore | Codebase exploration + iterative discovery | `flow-explore` |
| 2. Propose | Change proposal with intent, scope, approach | `flow-propose` |
| 3. Spec | Requirements and scenarios (parallel with Design) | `flow-spec` |
| 4. Design | Technical design and architecture decisions | `flow-design` |
| 5. Plan | Task breakdown with tracer bullet emphasis | `flow-plan` |
| 6. Apply | TDD implementation in batches | `flow-apply` |
| 7. Verify | Prove implementation matches specs | `flow-verify` |
| 8. Archive | Archive artifacts and complete the change | `flow-archive` |

### Flow Commands

| Command | Action |
|---------|--------|
| `/ai-flow:flow-init` | Initialize AI-Flow context in current project |
| `/ai-flow:flow-explore <topic>` | Explore an idea (no files created) |
| `/ai-flow:flow-new <change-name>` | Start a new change (explore -> propose) |
| `/ai-flow:flow-ff <change-name>` | Fast-forward through planning phases |
| `/ai-flow:flow-continue [change-name]` | Resume from the next pending phase |
| `/ai-flow:flow-spec` | Write delta specifications |
| `/ai-flow:flow-design` | Create technical design |
| `/ai-flow:flow-plan` | Break design into implementation tasks |
| `/ai-flow:flow-apply` | Implement planned tasks with TDD |
| `/ai-flow:flow-verify` | Verify implementation against spec |
| `/ai-flow:flow-archive` | Archive a completed change |
| `/ai-flow:flow-debug` | Investigate and fix unexpected failures |

### Command -> Agent Mapping

| Command | Agent | Entry point |
|---------|-------|-------------|
| `flow-init` | `ai-flow:initializer` | skill `ai-flow:flow-init` |
| `flow-explore` | `ai-flow:explorer` | skill `ai-flow:flow-explore` |
| `flow-new` | `ai-flow:orchestrator` | command `/ai-flow:flow-new` (meta) |
| `flow-ff` | `ai-flow:orchestrator` | command `/ai-flow:flow-ff` (meta) |
| `flow-continue` | `ai-flow:orchestrator` | command `/ai-flow:flow-continue` (meta) |
| `flow-propose` | `ai-flow:proposer` | skill `ai-flow:flow-propose` |
| `flow-spec` | `ai-flow:specifier` | skill `ai-flow:flow-spec` |
| `flow-design` | `ai-flow:designer` | skill `ai-flow:flow-design` |
| `flow-plan` | `ai-flow:planner` | skill `ai-flow:flow-plan` |
| `flow-apply` | `ai-flow:implementer` | skill `ai-flow:flow-apply` |
| `flow-verify` | `ai-flow:verifier` | skill `ai-flow:flow-verify` |
| `flow-archive` | `ai-flow:archivist` | skill `ai-flow:flow-archive` |
| `flow-debug` | `ai-flow:debugger` | skill `ai-flow:flow-debug` |

### Dependency Graph

```
                proposal
               (Phase 2)
                   |
       +-----------+-----------+
       |                       |
       v                       v
     spec                   design
   (Phase 3)              (Phase 4)
       |                       |
       +-----------+-----------+
                   |
                   v
                 plan
               (Phase 5)
                   |
                   v
                apply
               (Phase 6)
                   |
                   v
                verify
               (Phase 7)
                   |
                   v
               archive
               (Phase 8)
```

### Auto-invoke Rules

When performing these actions, ALWAYS invoke the corresponding skill FIRST:

| Action | Skill |
|--------|-------|
| Starting AI-Flow workflow or planning a feature | Invoke orchestrator via `flow-new` |
| Exploring ideas before a change | `flow-explore` |
| Creating a change proposal | `flow-propose` |
| Writing specifications | `flow-spec` |
| Creating technical design | `flow-design` |
| Breaking down tasks | `flow-plan` |
| Implementing tasks | `flow-apply` |
| Verifying implementation | `flow-verify` |
| Archiving a change | `flow-archive` |
| Investigating failures | `flow-debug` |
| Initializing AI-Flow in a project | `flow-init` |

### Orchestrator Rules

When AI-Flow is triggered, the orchestrator coordinates the workflow:

1. **Delegate-only**: The orchestrator NEVER executes phase work inline
2. Sub-agents have FULL access (read code, write code, run tests, follow coding skills)
3. Between sub-agent calls: show summary, ask user to proceed
4. `/ai-flow:flow-ff`, `/ai-flow:flow-continue`, `/ai-flow:flow-new` are META-COMMANDS handled by the orchestrator -- NOT skills. NEVER invoke them via the Skill tool.
5. Sub-agent suggestions for next commands: show user, don't auto-execute

The full orchestrator protocol lives in the `ai-flow:orchestrator` agent definition.

## Peer Dependencies

This plugin works best with:

- **superpowers** -- Provides systematic-debugging, brainstorming, verification-before-completion, using-git-worktrees, dispatching-parallel-agents, and other discipline skills referenced by AI-Flow phases. Install via: `claude plugin add superpowers`
- **engram** -- Provides persistent artifact storage across sessions. Without it, AI-Flow artifacts are inline-only (degraded mode). Install from: https://github.com/gentleman-programming/engram

Both are recommended but not required. AI-Flow degrades gracefully without them.
