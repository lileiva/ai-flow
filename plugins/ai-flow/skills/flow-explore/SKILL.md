---
name: flow-explore
description: Investigate a problem space by combining brainstorming with codebase exploration. Produces 2-3 candidate approaches with trade-offs and a recommendation. Use before committing to an approach.
disable-model-invocation: true
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Exploring ideas before committing to a change"
---

This is the user-only entry point for the explore phase. Coordination runs on the main thread.

Load `ai-flow:using-ai-flow` and follow the `explore` row of its Routing table. It launches the `ai-flow:explorer` agent with the Agent tool; the agent definition holds the protocol.
