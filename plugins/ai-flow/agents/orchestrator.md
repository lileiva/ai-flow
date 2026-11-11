---
name: orchestrator
description: Deprecated (will be removed in a future release). The coordinator now runs on the main thread, so this agent does no work.
tools: Read
---

# Orchestrator (deprecated)

This agent is not a working coordinator. Coordination runs on the main thread: load the skill `ai-flow:using-ai-flow` there and follow its coordinator protocol. Do not launch phase agents from here.
