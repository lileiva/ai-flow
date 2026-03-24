---
name: flow-propose
description: Create a formal change proposal with intent, scope, risks, rollback plan, and measurable success criteria. Reads exploration artifacts. Requires human approval before proceeding.
---

This phase is handled by the **proposer** agent.

Delegate to the `proposer` agent with the change name and project name. The agent will:
1. Read the exploration artifact from engram
2. **Ask the user 2-3 scope & priority questions** via `AskUserQuestion` to validate boundaries, trade-offs, and success criteria before writing the proposal
3. Select the best approach from exploration (incorporating user answers)
4. Write the proposal with all required sections (intent, scope in/out, approach, risks, rollback, success criteria)
5. Save proposal to engram under `flow/{change-name}/proposal`

**Interactive:** This phase pauses to ask the user questions about scope and priorities. The user's answers ensure the proposal reflects their actual intent.

**Human gate:** The orchestrator presents the proposal for approval before proceeding to spec and design.

See `agents/proposer.md` for the full protocol.
