---
name: flow-plan
description: Break a designed change into bite-sized implementation tasks with TDD steps baked into each task. Identifies the tracer bullet, builds the Connected Pairs registry, and groups tasks into batches. Requires human approval.
disable-model-invocation: true
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Breaking design into implementation tasks"
---

This is the user-only entry point for the plan phase. Coordination runs on the main thread.

Load `ai-flow:using-ai-flow` and follow the `plan` row of its Routing table. It launches the `ai-flow:planner` agent with the Agent tool; the agent definition holds the protocol.
