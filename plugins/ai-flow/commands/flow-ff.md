---
description: Fast-forward through planning phases — propose → spec + design (parallel) → plan
disable-model-invocation: true
---

# Fast-Forward Planning

Fast-forward the change named "$ARGUMENTS" through all planning phases.

Read `.ai-flow.json` from the project root if it exists — capture `linearSync` and `linear` settings.

Execute these steps in order:

1. **Launch the `proposer` agent** with change name "$ARGUMENTS". Wait for result. The proposer will use `AskUserQuestion` to interactively ask scope/priority questions.
2. Present proposal summary. **HUMAN GATE:** Approve / Revise / Reject.
3. If approved:
   - Launch `linear-sync` with phase="propose" if `linearSync: true` (in background)
   - **Launch `specifier` and `designer` agents in parallel.** Wait for both.
   - Launch `linear-sync` for phase="spec" and phase="design" if `linearSync: true` (in background)
4. **Launch the `planner` agent.** Wait for result.
5. Present plan summary. **HUMAN GATE:** Approve / Revise / Reject.
6. Launch `linear-sync` with phase="plan" if `linearSync: true`.

After approval, the change is ready for `/ai-flow:flow-apply`.
