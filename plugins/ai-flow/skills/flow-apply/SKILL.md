---
name: flow-apply
description: Execute plan tasks through strict TDD (RED-GREEN-REFACTOR). Writes tests first, then minimal implementation. Tracer bullet executes first. Two-stage review per task.
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Implementing planned tasks with TDD"
---

This phase is handled by the **implementer** agent.

Delegate to the `implementer` agent with the change name, project name, and batch to execute. The agent will:
1. Read plan, spec, and design from engram
2. Execute each task following the TDD cycle: RED → verify RED → GREEN → verify GREEN → REFACTOR → COMMIT
3. Track progress in engram under `flow/{change-name}/apply-progress`
4. Escalate to debugger agent if 3+ fix attempts fail

**Iron law:** No production code without a failing test first. Verify steps are MANDATORY.

Also read `skills/_shared/tdd-protocol.md` for the full TDD protocol.

See `agents/implementer.md` for the full protocol.
