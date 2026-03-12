---
description: Start a new change — runs explore → propose → human gate
disable-model-invocation: true
---

# Start New Change

You are starting a new AI-Flow change named "$ARGUMENTS".

Read `.ai-flow.json` from the project root if it exists — capture `linearSync` and `linear` settings for later.

Execute these steps in order:

1. **Launch the `explorer` agent** with the change description "$ARGUMENTS". Wait for its result.
2. Present the exploration summary to the user.
3. **Launch the `proposer` agent** with the exploration results and change name "$ARGUMENTS". Wait for its result.
4. Present the proposal summary to the user.
5. **HUMAN GATE:** Ask the user to Approve / Revise / Reject the proposal.
6. If approved and `.ai-flow.json` has `linearSync: true`, launch `linear-sync` with phase="propose" and the proposal summary.

If the user rejects, ask what they want changed and re-launch the proposer with feedback.
