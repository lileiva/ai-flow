---
name: flow-propose
description: Create a formal change proposal with intent, scope, risks, rollback plan, and measurable success criteria. Reads exploration artifacts. Requires human approval before proceeding.
disable-model-invocation: true
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Creating a formal change proposal"
---

This is the user-only entry point for the propose phase. Coordination runs on the main thread.

Load `ai-flow:using-ai-flow` and follow the `propose` row of its Routing table. It launches the `ai-flow:proposer` agent with the Agent tool; the agent definition holds the protocol.
