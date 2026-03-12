---
name: flow-debug
description: Systematically investigate and fix unexpected failures using root-cause-first protocol with TDD integration. Can be invoked at any point in the workflow — not tied to the DAG.
---

This phase is handled by the **debugger** agent.

Delegate to the `debugger` agent with the change name, project name, and description of the failure. The agent will:
1. Investigate root cause — read errors, reproduce, check recent changes, trace data flow
2. Analyze patterns — find working examples, compare, categorize the bug
3. Test hypotheses — one variable at a time
4. Fix with TDD — write reproducing test (RED), write fix (GREEN), verify no regressions
5. Save debug context to engram under `flow/{change-name}/debug/{description}`

**Iron law:** No fixes without root cause investigation first. Escalates after 3 failed attempts.

Also read `skills/_shared/tdd-protocol.md` for the TDD protocol.

See `agents/debugger.md` for the full protocol.
