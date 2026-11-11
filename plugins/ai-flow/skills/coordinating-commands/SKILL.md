---
name: coordinating-commands
description: Coordinator detail for the main thread, loaded from ai-flow:using-ai-flow when running flow-new, flow-ff or flow-continue, or when recovering state to find the next phase.
user-invocable: false
---

<SUBAGENT-STOP>
If you were dispatched as a sub-agent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

## Command procedures

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

**`/ai-flow:flow-apply`**: load `ai-flow:coordinating-apply` and follow its "Coordinating apply" section.

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

## Artifact Tracking

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

When the brainstorm artifact exists, pass its topic key to the proposer alongside the exploration topic key. When recovering, review which phases are complete and which artifacts exist (including optional brainstorm).
