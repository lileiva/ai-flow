---
name: flow-init
description: Bootstrap AI-Flow in a new project — detects tech stack, conventions, test runners, persistence, and creates .ai-flow.json config. Use when starting AI-Flow for the first time or when project context is missing.
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Initializing AI-Flow in a project"
---

This phase is handled by the **initializer** agent.

Delegate to the `initializer` agent with the project name. The agent will:
1. Detect technology stack, frameworks, test runners, and conventions
2. Verify engram persistence is available
3. Create `.ai-flow.json` at the project root with the configuration
4. Save project context to engram under `flow-init/{project-name}`

See `agents/initializer.md` for the full protocol.
