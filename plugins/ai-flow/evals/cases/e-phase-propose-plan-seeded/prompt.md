---
name: e-phase-propose-plan-seeded
description: "per-phase: propose, spec+design and plan from a seeded exploration in (mocked) engram; stops at the plan gate."
tags: [case-e, per-phase, small]
max_turns: 200
timeout_seconds: 1800
allowed_tools: [Agent, Skill, Read, Glob, Grep, Write, Edit, Bash, ToolSearch, TodoWrite]
append_system_prompt: |
  UNATTENDED EVAL RUN. No human is available to answer questions or approve gates.
  - Treat every human review gate (proposal, plan, tracer, verify) as approved. When you reach a gate, present its summary as usual, then print a line `AUTO-APPROVED GATE: <proposal|plan|tracer|verify>` and continue. Exception: if the task says to stop at a gate, print `STOPPED AT GATE: <gate>` and end the run there.
  - Never wait for answers. When a question would normally go to the user, choose the recommended or most reasonable option, print `ASSUMED ANSWER: <short answer>`, and continue.
  - Do not commit, push or tag unless the task asks for it.
  - When the task is finished, print `EVAL-RUN-COMPLETE` as the last line of your final message.
---
Using the AI-Flow workflow, continue change `capitalize-options` in engram project `textkit` from its existing exploration (engram topic key `flow/capitalize-options/explore`; do not explore again).

Run propose, then spec and design, then plan. The proposal gate is approved. STOP at the plan gate: print `STOPPED AT GATE: plan` and end the run without implementing anything.

The repository in the current directory is `textkit`, a small Node library tested with vitest (`npm test`).
