---
name: flow-archive
description: Close a completed change by building an archive report, consolidating all artifacts, preserving the decision trail, and updating DAG state. Only after verification passes.
disable-model-invocation: true
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Archiving a completed change"
---

This is the user-only entry point for the archive phase. Coordination runs on the main thread.

Load `ai-flow:using-ai-flow` and follow the `archive` row of its Routing table. It launches the `ai-flow:archivist` agent with the Agent tool; the agent definition holds the protocol.
