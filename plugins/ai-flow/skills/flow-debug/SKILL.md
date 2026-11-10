---
name: flow-debug
description: Systematically investigate and fix unexpected failures using root-cause-first protocol with TDD integration. Can be invoked at any point in the workflow — not tied to the DAG.
disable-model-invocation: true
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Investigating and fixing unexpected failures"
---

This is the user-only entry point for the debug phase. Coordination runs on the main thread.

Load `ai-flow:using-ai-flow` and follow the `debug` row of its Routing table. It launches the `ai-flow:debugger` agent with the Agent tool; the agent definition holds the protocol.
