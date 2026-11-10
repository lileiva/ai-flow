---
name: flow-design
description: Create the technical design with architecture decisions, file change plans, interfaces, data flow, and testing strategy. Reads the proposal. Can run in parallel with flow-spec.
disable-model-invocation: true
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Creating technical design"
---

This is the user-only entry point for the design phase. Coordination runs on the main thread.

Load `ai-flow:using-ai-flow` and follow the `design` row of its Routing table. It launches the `ai-flow:designer` agent with the Agent tool; the agent definition holds the protocol.
