---
name: flow-apply
description: Execute plan tasks through strict TDD (RED-GREEN-REFACTOR). Writes tests first, then minimal implementation. Tracer bullet executes first. Two-stage review per task.
disable-model-invocation: true
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Implementing planned tasks with TDD"
---

This is the user-only entry point for the apply phase. Coordination runs on the main thread.

Load `ai-flow:using-ai-flow`, then `ai-flow:coordinating-apply`, and follow its "Coordinating apply" section. It launches one `ai-flow:implementer` agent per task and runs the tracer gate.
