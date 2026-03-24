---
name: flow-plan
description: Break a designed change into bite-sized implementation tasks with TDD steps baked into each task. Identifies the tracer bullet, builds the Connected Pairs registry, and groups tasks into batches. Requires human approval.
---

This phase is handled by the **planner** agent.

Delegate to the `planner` agent with the change name and project name. The agent will:
1. Read spec and design from engram
2. Map spec scenarios to implementation order
3. Identify the tracer bullet (thinnest end-to-end slice)
4. Build the **Connected Pairs registry** — for each task that introduces a new layer connection, prepend a tracer sub-step (thin connectivity proof) before the behavior sub-step
5. Break into 2-5 minute tasks with TDD steps (including tracer sub-steps where needed)
6. Group into execution batches
7. Validate coverage of all scenarios and file changes
8. Save plan to engram under `flow/{change-name}/plan`

**Human gate:** The orchestrator presents the plan for approval before execution.

See `agents/planner.md` for the full protocol.
