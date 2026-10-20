---
name: flow-verify
description: Run completeness checks, spec compliance matrix, full test execution, and success criteria validation after all tasks are complete. Produces a PASS/FAIL verdict. Requires human approval.
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Verifying implementation against spec"
---

If you are the `ai-flow:verifier` agent, ignore this skill: your agent definition is the protocol. Do not launch another agent for this phase.

This phase is handled by the **verifier** agent.

Delegate to the `verifier` agent with the change name and project name. The agent will:
1. Read all artifacts from engram (proposal, spec, design, plan, apply-progress)
2. Check completeness — all plan tasks marked complete
3. Build spec compliance matrix — every scenario mapped to a passing test
4. Run build validation and full test suite
5. Check coverage against project thresholds
6. Verify all success criteria from the proposal are met
7. Save verification report to engram under `flow/{change-name}/verify-report`

**Human gate:** The orchestrator presents the verdict for approval before archiving.

The protocol lives in the `ai-flow:verifier` agent definition; launch it with the Agent tool (subagent_type `ai-flow:verifier`).
