---
name: coordinating-apply
description: Coordinator detail for the main thread, loaded from ai-flow:using-ai-flow when apply starts, when rework follows the verify gate, or when an implementer returns blocked.
user-invocable: false
---

<SUBAGENT-STOP>
If you were dispatched as a sub-agent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

## Coordinating apply

Apply runs one implementer instance per task, each launched fresh from the plan. A fresh instance keeps its context small and its test-first evidence checkable.

Launch with the Agent tool: `subagent_type` `ai-flow:implementer`, `model` sonnet, `effort` medium. Raise to opus with effort high after a blocked return or an evidence miss, and never go below sonnet. A user instruction about model or effort overrides these defaults. Launch one implementer per task, not per batch.

Task pack. Each launch prompt covers exactly one task and carries:
- Project: the engram `project` name.
- Change: the change name.
- Repo: the repository path and branch.
- Task id: for example 0.6, with the plan key (`flow/{change}/plan`, plus its part keys when the plan is split).
- Cited scenarios and decisions: the spec scenarios and design decisions listed in that task.
- Test command: the unit command named in the task, and the full-suite command to run before the commit.
- Completed tasks: the ids already done, so the instance does not redo them.
- TDD mode: `tdd`, or `n/a` for a task the plan marks as not testable first.
- The commit message from the task.
- "Return the tdd_evidence block" together with the return envelope.

Evidence storage. The engram `topic_key` upserts, so a single apply-progress key is overwritten by each per-task implementer. Each task's implementer therefore saves its tdd_evidence to `flow/{change}/apply-evidence-{task_id}`. Read the evidence from the handback first, and use that key as the backup when the handback lacks it.

Evidence check after each task. Mode `tdd` needs test_files, red.failing, red.after_test_write, red_before_impl and green.summary. Mode `n/a` needs na_reason and verify_command. On a miss, relaunch the task once with the instruction "re-establish RED", one routing step up (sonnet to opus, medium to high). A second miss is recorded as a warning and shown at the next gate.

The batch 0 tracer gate follows the last tracer task: present what was built and the test results, and wait for the user's answer before launching tasks from later batches.

Workspace isolation: before launching the first apply task, consider suggesting a git worktree to keep the main workspace clean. If `superpowers:using-git-worktrees` is available, reference that skill. Otherwise, suggest `git worktree add ../worktree-{change-name} -b apply/{change-name}` as a one-liner. This is optional. If the user declines or does not respond, proceed normally.

## Blocked routing

`blocked` from an implementer: launch `ai-flow:debugger` (opus/high) with the task id, the evidence and the apply-progress key. On debugger ok, launch a fresh implementer for that task one routing step up. If the debugger returns blocked, send a question to the user.

## Rework Protocol

When the user selects "Rework" at the verification gate:

1. Read the verify-report from engram to identify CRITICAL and WARNING issues.
2. For each CRITICAL issue, determine if it maps to an existing plan task or requires a new task.
3. Create a rework batch: launch the implementer agent with:
   - The original plan, spec, and design
   - A "rework" directive listing the specific issues to fix from the verify-report
   - The verify-report topic key for context
4. After rework completes, re-launch the verifier.
5. Present the new verdict at the human gate.

## Ecosystem Enhancement

If `superpowers:dispatching-parallel-agents` is available in the session context, also follow its parallel dispatch pattern for spec+design and batch execution. If `superpowers:using-git-worktrees` is available, consider using it for workspace isolation during apply phases. If `superpowers:finishing-a-development-branch` is available, follow its branch completion checklist when wrapping up a change. These complement (do not replace) the existing orchestration instructions defined above. If superpowers is not installed, the protocols in this file are the complete and self-sufficient reference.
