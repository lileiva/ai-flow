---
name: flow-init
description: Bootstrap AI-Flow in a new project — detects tech stack, conventions, test runners, persistence, and creates .ai-flow.json config. Use when starting AI-Flow for the first time or when project context is missing.
disable-model-invocation: true
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Initializing AI-Flow in a project"
---

This is the user-only entry point for the init phase. Coordination runs on the main thread.

Load `ai-flow:using-ai-flow` and follow the `init` row of its Routing table. It launches the `ai-flow:initializer` agent with the Agent tool; the agent definition holds the protocol.
