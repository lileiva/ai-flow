---
name: d-phase-apply-seeded
description: "per-phase: apply only, from a seeded and approved proposal/spec/design/plan in (mocked) engram."
tags: [case-d, per-phase, small, smoke]
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
Run only the AI-Flow apply phase (all batches) for change `add-reading-time` in engram project `textkit`.

The proposal, spec, design and plan for this change are already saved in engram (topic keys `flow/add-reading-time/proposal`, `flow/add-reading-time/spec`, `flow/add-reading-time/design` and `flow/add-reading-time/plan`), and the user has already approved the plan. Do not explore, propose, spec, design or plan again.

The repository in the current directory is `textkit`, a small Node library tested with vitest (`npm test`). Execute every batch of the plan, then stop after apply. Do not run verify or archive.
