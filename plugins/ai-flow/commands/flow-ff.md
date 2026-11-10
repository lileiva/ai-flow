---
description: Fast-forward through planning phases — propose → spec + design (parallel) → plan
disable-model-invocation: true
---

# Fast-Forward Planning

Load ai-flow:using-ai-flow (skip if it is already loaded) and coordinate on the main thread: you launch each phase agent yourself, and no agent launches another.

Fast-forward the change named "$ARGUMENTS" through all planning phases.

Execute these steps in order:

1. **Check for existing exploration** — search engram for `flow/$ARGUMENTS/explore`. If NOT found, launch the `explorer` agent with change name "$ARGUMENTS" first. Wait for result. If found, proceed to step 2.
2. **Launch the `proposer` agent** with change name "$ARGUMENTS". Wait for result. If it returns `needs_input`, you (the main thread) ask the blocking questions in one round and relaunch it with the answers.
3. Present proposal summary. **HUMAN GATE:** Approve / Revise / Reject.
4. If approved:
   - **Launch `specifier` and `designer` agents in parallel.** Wait for both.
5. **Launch the `planner` agent.** Wait for result.
6. Present plan summary. **HUMAN GATE:** Approve / Revise / Reject.

After approval, the change is ready for `/ai-flow:flow-apply`.
