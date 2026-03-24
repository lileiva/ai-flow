# Persistence Contract for AI-Flow

## Artifact Store Mode

AI-Flow uses **engram** as its persistence backend. All artifacts are stored in engram using deterministic topic keys (see `engram-convention.md`).

## Fallback Mode: `none`

When engram is unavailable (detected by the SessionStart hook or by failed `mem_search` calls), AI-Flow operates in a degraded inline-only mode:

1. Sub-agents SKIP all `mem_save`, `mem_search`, and `mem_get_observation` calls
2. Sub-agents include the full artifact content in their return payload under the `artifacts` key
3. The orchestrator passes artifact content to downstream sub-agents via the launch prompt
4. State tracking is maintained only in the orchestrator's conversation context
5. **WARNING:** Multi-session flows are not supported in `none` mode. If the conversation ends, all artifacts are lost.

This is a degraded mode -- a safety net, not a promoted workflow. The SessionStart hook warns users to install engram for full functionality. We recommend installing engram from: https://github.com/gentleman-programming/engram

## Sub-Agent Context Protocol

Sub-agents start with a fresh context. The orchestrator controls what context they receive.

### Reading Artifacts

| Context | Who Reads | How |
|---------|-----------|-----|
| Non-flow tasks | Orchestrator searches engram, passes summary in prompt | `mem_search` + `mem_get_observation` |
| Flow phases with dependencies | Sub-agent reads directly from engram | Orchestrator passes topic keys, sub-agent does two-step recovery |
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

After each phase transition, the orchestrator saves the DAG state to engram:

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

## Recovery After Context Loss

If the orchestrator loses state (e.g., after context compaction):

1. Search engram for `flow/{change-name}/state`
2. Two-step recover the state artifact
3. Resume from the last completed phase
