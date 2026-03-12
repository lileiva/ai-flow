---
name: flow-debug
description: Use when a test fails unexpectedly, a bug is discovered, or systematic investigation is needed. Follows a strict root-cause-first protocol with TDD integration. Available at any point in the workflow.
---

# Debugging Loop

## Purpose

Systematically investigate and fix unexpected failures. This protocol can be invoked at any point — during Apply, during Verify, or standalone for bug fixes.

## Iron Law

**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

Do not guess. Do not patch symptoms. Find the root cause, then fix it with TDD.

## When to Use

- A test fails unexpectedly during Apply (Step 4: Verify GREEN)
- Verification phase discovers failing tests
- A bug is reported that needs investigation
- Any unexpected behavior that needs systematic analysis

## Steps

### Phase 1: Root Cause Investigation (MUST complete before ANY fix)

#### 1.1 Read the Error Carefully
- Read the FULL error message and stack trace
- Do not skim — read every line
- Note the exact error type, message, file, and line number

#### 1.2 Reproduce Consistently
- Run the failing test or reproduction steps multiple times
- Confirm the failure is consistent (not flaky)
- If flaky: note the frequency and conditions

#### 1.3 Check Recent Changes
- What was the last change before the failure?
- `git diff` to see what changed
- Could any of these changes have caused the failure?

#### 1.4 Gather Evidence
- Add diagnostic logging if needed (temporary — remove after)
- Check inputs and outputs at each step of the failing code path
- In multi-component systems: instrument at each layer boundary

#### 1.5 Trace the Data Flow
- Start at the point of failure
- Trace BACKWARD through the call chain
- At each level ask: "Is the input to this function correct?"
- The root cause is where the data first becomes wrong

### Phase 2: Pattern Analysis

#### 2.1 Find Working Examples
- Is there similar code in the codebase that WORKS?
- Read it completely — do not skim
- What is different between the working code and the failing code?

#### 2.2 Compare Against Expected Behavior
- What does the spec say should happen?
- What is actually happening?
- Where is the divergence?

#### 2.3 Categorize the Bug
Common categories:
- **State bug:** Wrong state at the point of use (null, stale, uninitialized)
- **Logic bug:** Incorrect condition, off-by-one, wrong operator
- **Integration bug:** Two components disagree on a contract
- **Race condition:** Timing-dependent failure
- **Configuration bug:** Wrong config, missing env var, wrong path

### Phase 3: Hypothesis Testing

#### 3.1 Form a Hypothesis
- Based on the evidence, state a SPECIFIC hypothesis:
  - "The failure occurs because X returns null when Y has not been initialized"
  - NOT "something is wrong with the data"

#### 3.2 Test the Hypothesis
- Identify the smallest change that would confirm or refute the hypothesis
- Make ONLY that change
- One variable at a time — never change multiple things

#### 3.3 Evaluate
- Did the hypothesis hold?
- If YES: proceed to Phase 4 (Fix with TDD)
- If NO: form a new hypothesis based on the new evidence
- Do NOT pile on fixes — one hypothesis at a time

### Phase 4: Fix with TDD

#### 4.1 Write a Reproducing Test
- Write a test that captures the bug's behavior
- The test should FAIL (proving the bug exists)
- The test name should describe the bug: `test_{what_was_broken}`

#### 4.2 Verify RED
- Run the test — it MUST fail
- The failure should match the original bug's behavior

#### 4.3 Write the Fix
- Fix the ROOT CAUSE (not a symptom)
- Make the smallest change that fixes the issue
- Do not refactor, improve, or clean up unrelated code

#### 4.4 Verify GREEN
- Run the test — it MUST pass
- Run the FULL test suite — no regressions

#### 4.5 Commit
- Commit message: `fix: {what was broken} (root cause: {what caused it})`

## Escalation Rule

**If 3 or more fix attempts fail: STOP.**

This is NOT a series of failed hypotheses — it's a signal that the problem is architectural, not local.

When escalating:
1. Summarize what was tried and why each attempt failed
2. State your current best understanding of the root cause
3. Explain why you believe the problem is architectural
4. Present 2-3 potential paths forward for the human to decide

Do NOT continue attempting fixes after escalation. Wait for human guidance.

## Saving Debug Context

If the debugging session reveals important information (root cause of a tricky bug, non-obvious codebase behavior, gotcha), save it to engram:

```
Topic key: flow/{change-name}/debug/{brief-description}
Project: {project-name}
Content: what was found, root cause, fix applied, lessons learned
```

## Output

Return to orchestrator:
```json
{
  "status": "ok | escalated",
  "executive_summary": "Bug: {description}. Root cause: {cause}. Fix: {what was done}.",
  "artifacts": [{"name": "debug-context", "topic_key": "flow/{change-name}/debug/{description}"}],
  "next_recommended": ["resume flow-apply"],
  "risks": ["any related areas that might have similar issues"]
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | What to Do Instead |
|---|---|---|
| "Let me just try this quick fix" | Guessing wastes time and masks root causes | Investigate first, always |
| "I'll add a null check" | Band-aid on a symptom, root cause persists | Find WHY it's null |
| Changing multiple things at once | Can't tell what fixed it (or broke it more) | One change at a time |
| "It works now, not sure why" | Unexplained fixes are ticking time bombs | Understand before moving on |
| Deleting and rewriting from scratch | Destroys evidence, may reintroduce the bug | Trace and fix surgically |
| Retrying the same failing approach | Definition of insanity | New hypothesis or escalate |
