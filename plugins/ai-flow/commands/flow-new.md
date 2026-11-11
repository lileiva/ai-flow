---
description: Start a new change — runs explore → propose → human gate
disable-model-invocation: true
---

# Start New Change

Load ai-flow:using-ai-flow (skip if it is already loaded) and coordinate on the main thread: you launch each phase agent yourself, and no agent launches another.

You are starting a new AI-Flow change named "$ARGUMENTS".

Execute these steps in order:

1. **Launch the `explorer` agent** with the change description "$ARGUMENTS". Wait for its result. If it returns `needs_input`, you (the main thread) ask the blocking questions in one round and relaunch it with the answers.
2. Present the exploration summary to the user.
3. **Launch the `proposer` agent** with the exploration results and change name "$ARGUMENTS". Wait for its result. If it returns `needs_input`, you (the main thread) ask the blocking questions in one round and relaunch it with the answers.
4. Present the proposal summary to the user.
5. **HUMAN GATE:** Ask the user to Approve / Revise / Reject the proposal.

If the user rejects, ask what they want changed and re-launch the proposer with feedback.
