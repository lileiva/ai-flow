---
name: flow-propose
description: Create a formal change proposal with intent, scope, risks, rollback plan, and measurable success criteria. Reads exploration artifacts. Requires human approval before proceeding.
---

This phase is handled by the **proposer** agent.

Delegate to the `proposer` agent with the change name and project name. The agent will:
1. Select the best approach from exploration (or user direction)
2. Write the proposal with all required sections (intent, scope in/out, approach, risks, rollback, success criteria)
3. Save proposal to engram under `flow/{change-name}/proposal`

**Human gate:** The orchestrator presents the proposal for approval before proceeding to spec and design.

See `agents/proposer.md` for the full protocol.
