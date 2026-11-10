---
name: flow-verify
description: Run completeness checks, spec compliance matrix, full test execution, and success criteria validation after all tasks are complete. Produces a PASS/FAIL verdict. Requires human approval.
disable-model-invocation: true
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Verifying implementation against spec"
---

This is the user-only entry point for the verify phase. Coordination runs on the main thread.

Load `ai-flow:using-ai-flow` and follow the `verify` row of its Routing table. It launches the `ai-flow:verifier` agent with the Agent tool; the agent definition holds the protocol.
