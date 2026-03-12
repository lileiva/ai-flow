---
description: Resume a change from where it left off by recovering state from engram
disable-model-invocation: true
---

# Continue Change

Resume the change named "$ARGUMENTS" from the last completed phase.

Read `.ai-flow.json` from the project root if it exists — capture `linearSync` and `linear` settings.

Execute these steps:

1. **Search engram** for `flow/$ARGUMENTS/state` to recover DAG state.
2. Identify which phases are complete and which artifacts exist.
3. Determine the **next pending phase** in the dependency chain:
   - No proposal → launch `proposer`
   - Proposal but no spec/design → launch `specifier` and `designer` in parallel
   - Spec + design but no plan → launch `planner`
   - Plan but incomplete apply → launch `implementer` for the next batch
   - Apply complete but no verify → launch `verifier`
   - Verify PASS but no archive → launch `archivist`
4. Present the recovered state to the user and confirm before launching.
5. After each phase completes, launch `linear-sync` if `linearSync: true`.
