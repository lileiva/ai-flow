---
name: b-e2e-feature-truncate-words
description: "e2e small feature: add truncateWords to textkit; full AI-Flow explore-to-archive with auto-approved gates."
tags: [case-b, e2e, small]
max_turns: 200
timeout_seconds: 2700
allowed_tools: [Agent, Skill, Read, Glob, Grep, Write, Edit, Bash, ToolSearch, TodoWrite]
append_system_prompt: |
  UNATTENDED EVAL RUN. No human is available to answer questions or approve gates.
  - Treat every human review gate (proposal, plan, tracer, verify) as approved. When you reach a gate, present its summary as usual, then print a line `AUTO-APPROVED GATE: <proposal|plan|tracer|verify>` and continue. Exception: if the task says to stop at a gate, print `STOPPED AT GATE: <gate>` and end the run there.
  - Never wait for answers. When a question would normally go to the user, choose the recommended or most reasonable option, print `ASSUMED ANSWER: <short answer>`, and continue.
  - Do not commit, push or tag unless the task asks for it.
  - When the task is finished, print `EVAL-RUN-COMPLETE` as the last line of your final message.
---
Using the AI-Flow workflow, take change `add-truncate-words` from exploration through archive.

The repository in the current directory is `textkit`, a small Node library tested with vitest (`npm test`). Feature request: add a `truncateWords(str, n, options)` function, exported from `src/index.js` next to the existing `truncate`.

- It keeps at most the first `n` words of `str`. Words are separated by runs of whitespace; leading and trailing whitespace is ignored.
- If `str` has `n` words or fewer, it returns `str` unchanged.
- Otherwise it returns the first `n` words joined by single spaces, followed by the ellipsis. The ellipsis defaults to `…` and can be changed with `options.ellipsis` (for example `{ ellipsis: '...' }`).
- `truncateWords('the quick brown fox', 2)` returns `'the quick…'`.

Keep the existing functions and their tests unchanged.
