---
name: flow-spec
description: Write delta specifications with testable Given/When/Then scenarios for a proposed change. Extracts requirements as ADDED/MODIFIED/REMOVED. Can run in parallel with flow-design.
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Writing delta specifications"
---

If you are the `ai-flow:specifier` agent, ignore this skill: your agent definition is the protocol. Do not launch another agent for this phase.

This phase is handled by the **specifier** agent.

Delegate to the `specifier` agent with the change name and project name. The agent will:
1. Read the proposal from engram
2. Extract requirements organized as ADDED / MODIFIED / REMOVED
3. Write Given/When/Then scenarios for every requirement
4. Cross-reference with success criteria from the proposal
5. Validate testability of all scenarios
6. Save spec to engram under `flow/{change-name}/spec`

The protocol lives in the `ai-flow:specifier` agent definition; launch it with the Agent tool (subagent_type `ai-flow:specifier`).
