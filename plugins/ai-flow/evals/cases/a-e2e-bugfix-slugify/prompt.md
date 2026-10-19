---
name: a-e2e-bugfix-slugify
description: "e2e trivial bugfix: slugify keeps diacritics; full AI-Flow explore-to-archive with auto-approved gates."
tags: [case-a, e2e, trivial, smoke]
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
Using the AI-Flow workflow, take change `fix-slugify-diacritics` from exploration through archive.

The repository in the current directory is `textkit`, a small Node library tested with vitest (`npm test`). Bug report: `slugify` keeps accented letters instead of transliterating them to plain ASCII. For example `slugify('Crème Brûlée')` returns `crème-brûlée`, but it should return `creme-brulee`. Fix the bug without changing the existing behaviour for plain ASCII input.
