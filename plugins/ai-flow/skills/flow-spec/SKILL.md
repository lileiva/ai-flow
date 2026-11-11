---
name: flow-spec
description: Write delta specifications with testable Given/When/Then scenarios for a proposed change. Extracts requirements as ADDED/MODIFIED/REMOVED. Can run in parallel with flow-design.
disable-model-invocation: true
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Writing delta specifications"
---

This is the user-only entry point for the spec phase. Coordination runs on the main thread.

Load `ai-flow:using-ai-flow` and follow the `spec` row of its Routing table. It launches the `ai-flow:specifier` agent with the Agent tool; the agent definition holds the protocol.
