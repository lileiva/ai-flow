---
name: flow-apply
description: Use when executing a plan's tasks through strict TDD (RED-GREEN-REFACTOR). Reads plan, spec, and design artifacts. Implements code in batches with tracer bullet first and two-stage review per task.
---

# Phase 6: Apply with TDD

## Purpose

Execute the plan — writing code through strict TDD, with two-stage reviews after each task. This is where specs become tests and tests become code.

## Prerequisites

- Plan artifact MUST exist and be approved
- Spec artifact MUST exist
- Design artifact MUST exist

## Reading Context

Read ALL three artifacts (REQUIRED):

Plan:
1. `mem_search(query: "flow/{change-name}/plan", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read plan

Spec:
1. `mem_search(query: "flow/{change-name}/spec", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read spec

Design:
1. `mem_search(query: "flow/{change-name}/design", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read design

Also read `skills/_shared/tdd-protocol.md` for the TDD iron law and cycle details.

## Execution Model

The orchestrator launches apply sub-agents in **batches** as defined in the plan. Each batch may contain one or more tasks.

### Batch 0: Tracer Bullet

Always execute first, always alone. This is the thinnest end-to-end slice.

1. Execute the tracer bullet task following the TDD cycle
2. Run the full test suite after completion
3. Report back to orchestrator with results
4. **Wait for human feedback** before proceeding to Batch 1

### Subsequent Batches

For each batch:
1. Identify independent tasks (can run in parallel) vs dependent tasks (must run sequentially)
2. Execute each task following the TDD cycle below
3. After all tasks in the batch: run the full test suite
4. Report batch completion to orchestrator

## The TDD Cycle (Per Task)

For each task in the plan, follow these steps EXACTLY:

### Step 1: RED — Write Failing Test

- Read the spec scenario referenced by this task
- Write ONE test that asserts the behavior described in the scenario
- The test name should describe the behavior: `test_{scenario_description}`
- Use the test file path specified in the plan
- Prefer real dependencies over mocks

### Step 2: Verify RED (MANDATORY — NEVER SKIP)

- Run the test command specified in the plan
- The test MUST fail
- Verify the failure is because the feature is MISSING, not because of a typo or syntax error
- If the test passes: STOP. Either the test is wrong (testing nothing) or the feature already exists. Investigate before proceeding.

### Step 3: GREEN — Write Minimal Code

- Write the SIMPLEST code that makes the test pass
- Only what the test demands — nothing more
- No "while I'm here" improvements
- No anticipating future requirements (YAGNI)
- Use the file path specified in the plan

### Step 4: Verify GREEN (MANDATORY — NEVER SKIP)

- Run the test command
- The NEW test MUST pass
- ALL existing tests MUST still pass
- If the new test fails: fix the IMPLEMENTATION, not the test
- If an existing test breaks: you introduced a regression — fix it before proceeding
- Output must be clean (no warnings, no errors in unrelated areas)

### Step 5: REFACTOR

- Only after achieving green
- Remove duplication, improve names, extract helpers if needed
- Run tests after EACH refactor step to confirm still green
- Do NOT add behavior during refactoring
- If the plan specifies "No refactoring needed," skip this step

### Step 6: COMMIT

- Commit the test + implementation together
- Commit message format: `{task-description} (REQ-{id}, Scenario {n})`

## Two-Stage Review Per Task

After completing a task's TDD cycle:

### Stage 1: Spec Compliance Review

A reviewer sub-agent checks:
- Does the implementation satisfy the spec scenario this task was derived from?
- Does the test actually test the right behavior?
- Is there anything the spec requires that is missing?
- Is there anything implemented that the spec does NOT require? (over-engineering)

**Critical rule:** The reviewer reads the CODE, not the implementer's report. Do not trust self-reported success.

If review fails: implementer fixes the issues and re-submits for review.

### Stage 2: Code Quality Review

A separate reviewer sub-agent checks (ONLY after spec compliance passes):
- Code style and naming conventions
- Error handling
- Performance concerns
- No unnecessary complexity
- Tests are clear and maintainable

If review fails: implementer fixes the issues and re-submits for review.

## Progress Tracking

After each task completion, update the progress artifact:

```
Topic key: flow/{change-name}/apply-progress
Project: {project-name}
Content:
  - Task {batch.number}: {status} (ok|failed|blocked)
  - Batch {n}: {complete|in-progress|pending}
  - Overall: {n}/{total} tasks complete
  - Issues: {any blockers or concerns}
```

## Debugging Integration

If a test fails UNEXPECTEDLY during Step 4 (Verify GREEN):

1. Do NOT immediately add more code
2. Re-read the test — is it testing what you think?
3. Re-read the implementation — is it doing what you think?
4. If the failure is genuinely unexpected: invoke the `flow-debug` protocol
5. If 3+ fix attempts fail: STOP and escalate to the orchestrator with a summary

## Output

Return to orchestrator after each batch:
```json
{
  "status": "ok | warning | blocked | failed",
  "executive_summary": "Batch {n} complete: {n}/{n} tasks done. All tests passing.",
  "artifacts": [{"name": "apply-progress", "topic_key": "flow/{change-name}/apply-progress"}],
  "next_recommended": ["flow-apply (next batch)" | "flow-verify"],
  "risks": ["any concerns or near-misses"]
}
```

## Iron Laws

1. **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.** If you write code before the test: delete it.
2. **Steps 2 and 4 are MANDATORY.** Skipping verification is a protocol violation.
3. **Spec compliance review reads CODE, not reports.** Never trust self-reported success.
4. **Tracer bullet executes first.** No exceptions.

## Common Rationalizations (Reject All of These)

| Rationalization | Why It's Wrong | Correct Action |
|---|---|---|
| "This is too simple to test" | Simple code has simple tests. Write them. | Write the test. |
| "I'll test after I write the code" | That's not TDD. Tests become confirmation bias. | Delete the code, write the test first. |
| "I already know it works" | Knowing is not evidence. | Run the test and prove it. |
| "Just this once I'll skip verify" | Every skipped verification is a potential silent failure. | Run the test. |
| "The refactoring is obvious" | Obvious changes break things too. | Run tests after every refactor step. |
| "Mocking is faster" | Faster tests that test nothing are worthless. | Use real dependencies where possible. |
