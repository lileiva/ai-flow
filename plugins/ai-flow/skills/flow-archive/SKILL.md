---
name: flow-archive
description: Close a completed change by building an archive report, consolidating all artifacts, preserving the decision trail, and updating DAG state. Only after verification passes.
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Archiving a completed change"
---

If you are the `ai-flow:archivist` agent, ignore this skill: your agent definition is the protocol. Do not launch another agent for this phase.

This phase is handled by the **archivist** agent.

Delegate to the `archivist` agent with the change name and project name. The agent will:
1. Validate verification verdict is PASS or PASS WITH WARNINGS
2. Read all artifacts from engram
3. Build archive report with summary, artifact lineage, spec integration, architecture decisions, statistics
4. Save archive report to engram under `flow/{change-name}/archive-report`
5. Update DAG state to archived

The protocol lives in the `ai-flow:archivist` agent definition; launch it with the Agent tool (subagent_type `ai-flow:archivist`).
