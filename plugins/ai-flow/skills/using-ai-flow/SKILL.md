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

AI-Flow is an 8-phase workflow for planning and implementing changes with rigor. Each phase is handled by a specialized sub-agent. The **main thread is the coordinator**: it keeps the conversation with the user, launches the phase agents, runs the human gates and tracks state. Phase work itself never runs inline on the main thread.

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
| `flow-new` | `ai-flow:explorer`, then `ai-flow:proposer` | command `/ai-flow:flow-new` (meta, run on the main thread) |
| `flow-ff` | `ai-flow:proposer`, `ai-flow:specifier`, `ai-flow:designer`, `ai-flow:planner` | command `/ai-flow:flow-ff` (meta, run on the main thread) |
| `flow-continue` | the next pending phase's agent (for example `ai-flow:specifier`) | command `/ai-flow:flow-continue` (meta, run on the main thread) |
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
| Starting AI-Flow workflow or planning a feature | Follow the coordinator protocol below, starting with `/ai-flow:flow-new` |
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

## Coordinator protocol

The main thread is the coordinator. Your job here is to keep a thin conversation with the user, delegate all phase work to the `ai-flow:*` agents, present summaries, run the human gates and track DAG state. Every token you keep persists for the whole conversation, so keep your context lean.

Do not read source code to understand the codebase, write or edit code, write specs, designs or plans, run tests or builds, or do quick analysis inline. Delegate each of these to the matching agent.

`/ai-flow:flow-ff`, `/ai-flow:flow-continue` and `/ai-flow:flow-new` are meta-commands handled here, not skills, so do not invoke them with the Skill tool. When an agent suggests a next command, show it to the user and do not run it automatically. A deprecated stub agent named orchestrator still ships for old configs; it does no work, so ignore it.

### Identity Inheritance

If the project has an `AGENTS.md` file, read it and inherit the identity, tone, and conventions defined there. Apply the inherited identity as an overlay on top of your coordinator role: it shapes your voice and style but does not replace the flow rules in this file. If no `AGENTS.md` exists, use your default voice. Pass the inherited identity context to every agent launch so the tone stays consistent.

### Persistence

AI-Flow uses **engram** as its artifact store. All artifacts use deterministic topic keys: `flow/{change-name}/{artifact-type}`. The naming convention is in `_shared/engram-convention.md` and the sub-agent context protocol in `_shared/persistence-contract.md`, both in the ai-flow plugin's skills directory. If engram is unavailable, follow `_shared/engram-fallback.md` in the same place.

Dependencies between phases: spec and design can run in parallel (both depend only on the proposal), the plan depends on both, and apply, verify and archive are strictly sequential.

### Specialized Agents

| Phase | Agent | Tool Access | Purpose |
|-------|-------|-------------|---------|
| 0 | `initializer` | Writes `.ai-flow.json` only | Bootstrap project context |
| 1 | `explorer` | Read-only | Brainstorm and investigate |
| 2 | `proposer` | Read-only | Formal change proposals |
| 3 | `specifier` | Read-only | Delta specs with Given/When/Then |
| 4 | `designer` | Read-only | Technical design and architecture |
| 5 | `planner` | Read-only | Task breakdown with TDD steps |
| 6 | `implementer` | **Full access** | TDD execution (RED-GREEN-REFACTOR) |
| 7 | `verifier` | Read + run tests | Spec compliance and quality gate |
| 8 | `archivist` | Read-only + engram | Archive and close out |
| Any | `debugger` | **Full access** | Root-cause-first debugging |

### Command procedures

**`/ai-flow:flow-init`**: launch the initializer agent.

**`/ai-flow:flow-explore <topic>`**: launch the explorer agent with the topic and project name.

**`/ai-flow:flow-new <change-name>`** (meta-command):
1. Launch the explorer agent with the change description.
2. Wait for the result and present a summary to the user.
3. Launch the proposer agent with the exploration results. Pass both topic keys: `flow/{change-name}/explore` (required) and `flow/{change-name}/brainstorm` (optional, the explorer produces it from the iterative discovery loop).
4. Wait for the result and present the proposal summary.
5. **Human gate:** ask the user to approve the proposal.

**`/ai-flow:flow-spec`** and **`/ai-flow:flow-design`**: launch the specifier or designer agent with the change name and project name. The agent reads the proposal from engram. You can launch both in parallel.

**`/ai-flow:flow-plan`**: launch the planner agent with the change name and project name; it reads spec and design from engram. **Human gate:** present the plan summary and ask the user to approve before apply.

**`/ai-flow:flow-apply`**: follow "Coordinating apply" below. Launch one implementer per task, not per batch.

Workspace isolation: before launching the first apply batch, consider suggesting a git worktree to keep the main workspace clean during implementation. If `superpowers:using-git-worktrees` is available, reference that skill. Otherwise, suggest `git worktree add ../worktree-{change-name} -b apply/{change-name}` as a one-liner. This is optional. If the user declines or does not respond, proceed normally.

**`/ai-flow:flow-verify`**: launch the verifier agent; it reads all artifacts from engram. **Human gate:** present the verification report and ask the user to approve or send back for rework.

**`/ai-flow:flow-archive`**: launch the archivist agent; it reads all artifacts from engram.

**`/ai-flow:flow-ff <change-name>`** (meta-command, fast-forward through planning):
1. Launch the proposer agent, wait, present a summary, then the **human gate**.
2. Launch the specifier and designer agents in parallel and wait for both.
3. Launch the planner agent, wait, present a summary, then the **human gate**.

**`/ai-flow:flow-continue [change-name]`** (meta-command):
1. Recover state from engram: `flow/{change-name}/state`.
2. Identify the next missing artifact in the dependency chain.
3. Launch the corresponding agent.

**`/ai-flow:flow-debug`**: launch the debugger agent. It can run at any time and is not tied to the DAG.

### Coordinating apply

Apply runs one implementer instance per task, each launched fresh from the plan. A fresh instance keeps its context small and its test-first evidence checkable.

Launch with the Agent tool: `subagent_type` `ai-flow:implementer`, `model` sonnet, `effort` medium. Raise to opus with effort high after a blocked return or an evidence miss, and never go below sonnet. A user instruction about model or effort overrides these defaults.

### Sub-Agent Launch Template

Launch each phase agent with the Agent tool and include in the prompt:

1. **Agent:** `subagent_type` `ai-flow:{agent}` (for example `ai-flow:designer` for the design phase). The agent definition is its protocol; do not tell it to load the `flow-{phase}` skill.
2. **Project name:** for the engram `project` field.
3. **Change name:** for topic key construction.
4. **Artifact references:** which engram topic keys to read (the sub-agent does two-step recovery).
5. **Shared protocols:** `_shared/tdd-protocol.md` in the ai-flow plugin's skills directory (for apply and debug phases).
6. **Save instructions:** "Save your output to engram with topic key `flow/{change-name}/{artifact-type}`".
7. **Return contract:** "Return: status, executive_summary, artifacts, next_recommended, risks".

### Human Gates

Present a summary and ask for approval at these points before proceeding:

| Gate | After Phase | What to Present | Options |
|------|-------------|-----------------|---------|
| Proposal approval | Phase 2 | Intent, scope, risks, success criteria | Approve / Revise / Reject |
| Plan approval | Phase 5 | Task count, batches, tracer bullet description | Approve / Revise / Reject |
| Tracer bullet feedback | Phase 6 (batch 0) | What was built, test results | Continue / Adjust approach |
| Verification approval | Phase 7 | Verdict, compliance matrix summary, issues | Proceed to archive / Rework |

If the user rejects: ask what they want changed, then re-launch the phase with the feedback.

### DAG State Updates

After every phase completes (whether by sub-agent return or human gate approval), save the DAG state to engram:

Topic key: `flow/{change-name}/state`

Content:
- change: {change-name}
- current_phase: {just-completed-phase}
- completed_phases: [list all completed phases with status]
- artifacts: [list all artifact topic keys that exist]
- pending_gates: [list any pending human gates]

As the coordinator you own the DAG state and save it after every phase transition. Two agents also write `flow/{change-name}/state`: the proposer (a pending-approval state after it saves the proposal) and the archivist (the archived state). Every writer reads the current state first and upserts the full document. Without consistent state updates, `/ai-flow:flow-continue` cannot recover correctly.

### Rework Protocol

When the user selects "Rework" at the verification gate:

1. Read the verify-report from engram to identify CRITICAL and WARNING issues.
2. For each CRITICAL issue, determine if it maps to an existing plan task or requires a new task.
3. Create a rework batch: launch the implementer agent with:
   - The original plan, spec, and design
   - A "rework" directive listing the specific issues to fix from the verify-report
   - The verify-report topic key for context
4. After rework completes, re-launch the verifier.
5. Present the new verdict at the human gate.

### Task Escalation

When the user describes a task:

1. **Simple question**: answer briefly if you already know. If not, delegate.
2. **Small task** (single file, quick fix): delegate to a general sub-agent. Suggest TDD.
3. **Bug fix**: suggest `/ai-flow:flow-debug` for systematic investigation.
4. **Medium feature** (3-10 files): suggest the full flow, `/ai-flow:flow-new <change-name>`.
5. **Large feature** (10+ files): suggest the full flow with tracer bullet emphasis.

### Skill Creation Detection

After any phase completes, check the sub-agent's return payload for indications of reusable patterns. Look for language such as "reusable pattern found", "could be extracted as a skill", "recurring pattern", or similar.

If a reusable pattern is detected:
1. Present a suggestion to the user: "A reusable pattern was detected: {description}. Consider running `/skill-creator` to extract it as a reusable skill."
2. If the user declines, continue the current flow without interruption.
3. If the user accepts, note the pattern for post-flow action. Do not interrupt the current flow to create the skill immediately.
4. If no reusable pattern is detected, make no suggestion.

This is advisory only -- do not block the flow for skill creation.

### Artifact Tracking

The following artifacts are tracked per change. All are stored in engram with deterministic topic keys:

| Artifact | Topic Key | Producer | Required |
|----------|-----------|----------|----------|
| Exploration | `flow/{change-name}/explore` | explorer | Yes |
| Brainstorm | `flow/{change-name}/brainstorm` | explorer | No (optional, from iterative discovery loop) |
| Proposal | `flow/{change-name}/proposal` | proposer | Yes |
| Spec | `flow/{change-name}/spec` | specifier | Yes |
| Design | `flow/{change-name}/design` | designer | Yes |
| Plan | `flow/{change-name}/plan` | planner | Yes |
| Apply progress | `flow/{change-name}/apply-progress` | implementer | Yes |
| Verify report | `flow/{change-name}/verify-report` | verifier | Yes |
| Archive report | `flow/{change-name}/archive-report` | archivist | Yes |
| DAG state | `flow/{change-name}/state` | coordinator (also proposer, archivist) | Yes |

When the brainstorm artifact exists, pass its topic key to the proposer alongside the exploration topic key.

### State Recovery

If you lose context (e.g., after compaction):

1. Search engram for `flow/{change-name}/state`
2. Two-step recover the state artifact
3. Review which phases are complete and which artifacts exist (including optional brainstorm)
4. Resume from the next pending phase

### Ecosystem Enhancement

If `superpowers:dispatching-parallel-agents` is available in the session context, also follow its parallel dispatch pattern for spec+design and batch execution. If `superpowers:using-git-worktrees` is available, consider using it for workspace isolation during apply phases. If `superpowers:finishing-a-development-branch` is available, follow its branch completion checklist when wrapping up a change. These complement (do not replace) the existing orchestration instructions defined above. If superpowers is not installed, the protocols in this file are the complete and self-sufficient reference.

### Tracer Bullets

When building features, the sub agents should build a tiny, end-to-end slice of the feature first, seek feedback, then expand out from there.

## Peer Dependencies

This plugin works best with:

- **superpowers** -- Provides systematic-debugging, brainstorming, verification-before-completion, using-git-worktrees, dispatching-parallel-agents, and other discipline skills referenced by AI-Flow phases. Install via: `claude plugin add superpowers`
- **engram** -- Provides persistent artifact storage across sessions. Without it, AI-Flow artifacts are inline-only (degraded mode). Install from: https://github.com/gentleman-programming/engram

Both are recommended but not required. AI-Flow degrades gracefully without them.
