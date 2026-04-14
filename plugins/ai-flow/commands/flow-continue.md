---
description: Resume a change from where it left off by recovering state from engram
disable-model-invocation: true
---

# Continue Change

Resume the change named "$ARGUMENTS" from the last completed phase.

Execute these steps:

1. **Search engram** for `flow/$ARGUMENTS/state` to recover DAG state.
   If no state is found in engram:
   a. Search for individual artifacts: `flow/$ARGUMENTS/proposal`, `flow/$ARGUMENTS/spec`, etc.
   b. Reconstruct state from whichever artifacts exist
   c. If NO artifacts exist at all, inform the user: "No state found for change '$ARGUMENTS'. Use `/flow-new $ARGUMENTS` to start a new change."
2. Identify which phases are complete and which artifacts exist.
3. Determine the **next pending phase** in the dependency chain:
   - No proposal → launch `proposer`
   - Proposal but no spec/design → launch `specifier` and `designer` in parallel
   - Spec + design but no plan → launch `planner`
   - Plan but incomplete apply → launch `implementer` for the next batch
   - Apply complete but no verify → launch `verifier`
   - Verify PASS but no archive → launch `archivist`
4. Present the recovered state to the user and confirm before launching.
