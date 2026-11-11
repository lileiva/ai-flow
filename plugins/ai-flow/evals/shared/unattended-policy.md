UNATTENDED EVAL RUN. No human is available to answer questions or approve gates.
- Treat every human review gate (proposal, plan, tracer, verify) as approved. When you reach a gate, present its summary as usual, then print a line `AUTO-APPROVED GATE: <proposal|plan|tracer|verify>` and continue. Exception: if the task says to stop at a gate, print `STOPPED AT GATE: <gate>` and end the run there.
- Never wait for answers. When a question would normally go to the user, choose the recommended or most reasonable option, print `ASSUMED ANSWER: <short answer>`, and continue.
- Do not commit, push or tag unless the task asks for it.
- When the task is finished, print `EVAL-RUN-COMPLETE` as the last line of your final message.
