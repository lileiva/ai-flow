# Persistence Contract for AI-Flow

## Artifact Store Mode

AI-Flow uses **engram** as its persistence backend. All artifacts are stored in engram using deterministic topic keys (see `engram-convention.md`).

## Fallback Mode: `none`

When engram is unavailable, AI-Flow runs in a degraded inline-only mode. The detection signals and what each agent does are in `engram-fallback.md` (the single source).

## Sub-Agent Context Protocol

Sub-agents start with a fresh context. The orchestrator controls what context they receive.

### Reading Artifacts

| Context | Who Reads | How |
|---------|-----------|-----|
| Non-flow tasks | Orchestrator searches engram, passes summary in prompt | `mem_search` + `mem_get_observation` |
| Flow phases with dependencies | Sub-agent reads directly from engram | Orchestrator passes topic keys, sub-agent does two-step recovery (see Two-Step Recovery in `engram-convention.md`) |
| Flow phases without dependencies | Nobody | Sub-agent starts fresh |

### Writing Artifacts

Sub-agents ALWAYS write their own artifacts to engram via `mem_save`. They have the complete detail — if they wait for the orchestrator to save, nuance is lost.

### Mandatory Instructions for Every Sub-Agent

Every sub-agent prompt MUST include:

1. The project name (for engram `project` field)
2. The change name (for topic key construction)
3. Which artifacts to read (as topic keys) and the two-step recovery instructions
4. Instructions to save the output artifact to engram
5. The return contract (see below)

## Sub-Agent Return Contract

Every sub-agent returns:

```json
{
  "status": "ok | warning | blocked | failed",
  "executive_summary": "Short, decision-grade summary",
  "artifacts": [{"name": "...", "topic_key": "..."}],
  "next_recommended": ["next-phase"],
  "risks": ["optional risk list"]
}
```

## DAG State Persistence

The orchestrator owns the DAG state and saves it after each phase transition. The proposer (pending-approval state, after saving the proposal) and the archivist (archived state) also write it. Every writer reads the current state first and upserts the full document:

Topic key: `flow/{change-name}/state`

Content:
```yaml
change: {change-name}
current_phase: {phase}
completed_phases:
  - {phase}: {status}
artifacts:
  - {phase}: {topic_key}
pending_gates:
  - {phase}: {gate-type}
```

## Interactive Tools

### AskUserQuestion

`AskUserQuestion` is an interactive tool that presents structured, selectable questions in the terminal. It is used by the explorer and proposer agents to gather requirements and clarify scope interactively.

**Fallback:** If `AskUserQuestion` is unavailable (tool not found in the session), agents should present questions as numbered options in their text output and ask the user to respond. This provides the same structured questioning flow without the interactive tool.

## Recovery After Context Loss

If the orchestrator loses state (e.g., after context compaction):

1. Search engram for `flow/{change-name}/state`
2. Two-step recover the state artifact
3. Resume from the last completed phase
