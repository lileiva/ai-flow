# Persistence Contract for AI-Flow

## Artifact Store Mode

AI-Flow uses **engram** as its persistence backend. All artifacts are stored in engram using deterministic topic keys (see `engram-convention.md`).

## Fallback Mode: `none`

When engram is unavailable, AI-Flow runs in a degraded inline-only mode. The detection signals and what each agent does are in `engram-fallback.md` (the single source).

## Sub-Agent Context Protocol

Sub-agents start with a fresh context. The coordinator controls what context they receive.

### Reading Artifacts

| Context | Who Reads | How |
|---------|-----------|-----|
| Non-flow tasks | Coordinator searches engram, passes summary in prompt | `mem_search` + `mem_get_observation` |
| Flow phases with dependencies | Sub-agent reads directly from engram | Coordinator passes topic keys, sub-agent does two-step recovery (see Two-Step Recovery in `engram-convention.md`) |
| Flow phases without dependencies | Nobody | Sub-agent starts fresh |

### Writing Artifacts

Sub-agents write their own artifacts to engram via `mem_save`, because they hold the complete detail and nuance is lost if the coordinator saves for them.

### Mandatory Instructions for Every Sub-Agent

Every sub-agent prompt includes:

1. The project name (for engram `project` field)
2. The change name (for topic key construction)
3. Which artifacts to read (as topic keys) and the two-step recovery instructions
4. Instructions to save the output artifact to engram
5. The return contract (see below)

## Sub-Agent Return Contract (envelope v2)

Every sub-agent returns one JSON object, as the last thing in its final message:

```json
{
  "status": "ok | partial | needs_input | blocked | error",
  "executive_summary": "Short, decision-grade summary",
  "artifacts": [{"name": "...", "topic_key": "..."}],
  "next_recommended": ["next-phase"],
  "risks": ["optional risk list"],
  "open_questions": [
    {"id": "Q1", "question": "...", "why": "what depends on the answer", "options": ["2 to 4 choices"], "recommended": "one of the options", "blocking": true}
  ],
  "blocked_reason": "required when status is blocked",
  "evidence": {}
}
```

Envelope fields: `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, `open_questions`, `blocked_reason`, `evidence`.

- `status`: ok (done), partial (done with caveats in risks), needs_input (cannot continue without a user decision, see open_questions), blocked (cannot continue, see blocked_reason), error (the phase failed).
- `open_questions`: required and non-empty when status is needs_input, otherwise omitted or empty. Each item has id, question, why, options (2 to 4), recommended and blocking.
- `blocked_reason`: required when status is blocked, otherwise omitted.
- `evidence`: phase-specific object, omitted when the phase has none. The implementer's TDD record lives at `evidence.tdd_evidence` as a JSON object inside the envelope. It is never a markdown block or prose beside the envelope, so the coordinator reads it from one place.
- Sub-agents never ask the user directly. They return open_questions and the coordinator asks.

## DAG State Persistence

The coordinator owns the DAG state and saves it after each phase transition. The proposer (pending-approval state, after saving the proposal) and the archivist (archived state) also write it. Every writer reads the current state first and upserts the full document:

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

If the coordinator loses state (e.g., after context compaction):

1. Search engram for `flow/{change-name}/state`
2. Two-step recover the state artifact
3. Resume from the last completed phase
