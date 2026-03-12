---
name: flow-design
description: Create the technical design with architecture decisions, file change plans, interfaces, data flow, and testing strategy. Reads the proposal. Can run in parallel with flow-spec.
---

This phase is handled by the **designer** agent.

Delegate to the `designer` agent with the change name and project name. The agent will:
1. Read the proposal (and spec if available) from engram
2. Explore current architecture and existing patterns
3. Define architecture decisions with rationale and alternatives
4. Specify file changes (created, modified, deleted)
5. Define interfaces, data flow, and testing strategy
6. Save design to engram under `flow/{change-name}/design`

See `agents/designer.md` for the full protocol.
