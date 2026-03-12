---
name: flow-verify
description: Use when all tasks from the plan are complete and the implementation needs final verification. Runs completeness checks, spec compliance matrix, test execution, and produces a PASS/FAIL verdict.
---

# Phase 7: Verify

## Purpose

Confirm that everything works, everything is covered, and the change meets its success criteria. This is the quality gate before archiving.

## Prerequisites

- All tasks from the plan MUST be marked complete
- Apply-progress artifact should exist

## Reading Context

Read these artifacts (ALL REQUIRED):

Proposal (for success criteria):
1. `mem_search(query: "flow/{change-name}/proposal", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read proposal

Spec (for compliance matrix):
1. `mem_search(query: "flow/{change-name}/spec", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read spec

Design (for coherence check):
1. `mem_search(query: "flow/{change-name}/design", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read design

Plan (for completeness check):
1. `mem_search(query: "flow/{change-name}/plan", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read plan

Apply progress:
1. `mem_search(query: "flow/{change-name}/apply-progress", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read progress

## Verification Steps

Execute ALL of the following checks. Do not skip any.

### Check 1: Completeness

- Are ALL tasks from the plan marked complete?
- Are there any tasks marked as blocked or failed?
- Were any tasks skipped? If so, why?

**Result:** COMPLETE / INCOMPLETE (list missing tasks)

### Check 2: Spec Compliance Matrix

Build a matrix that maps EVERY Given/When/Then scenario from the spec to a test:

```
| Requirement | Scenario | Test File | Test Name | Status |
|-------------|----------|-----------|-----------|--------|
| REQ-001 | Scenario 1: happy path | src/__tests__/auth.test.ts | test_user_can_login | PASS |
| REQ-001 | Scenario 2: invalid password | src/__tests__/auth.test.ts | test_invalid_password_rejected | PASS |
| REQ-002 | Scenario 1: ... | ... | ... | PASS |
```

Rules:
- A scenario is COMPLIANT only when a test covering it has PASSED
- A scenario with no corresponding test is NON-COMPLIANT
- A scenario with a failing test is NON-COMPLIANT

**Result:** {n}/{total} scenarios compliant

### Check 3: Build Validation

Run the project's build command:
- Clean build with no errors
- No type errors (for typed languages)
- No compilation warnings that indicate problems

**Result:** BUILD PASS / BUILD FAIL (with error details)

### Check 4: Full Test Execution

Run the ENTIRE test suite (not just new tests):
- All tests must pass
- Capture the full output
- Note any flaky tests (tests that sometimes pass, sometimes fail)

**Result:** {passed}/{total} tests pass. {failed} failures. {skipped} skipped.

### Check 5: Coverage Validation

If the project has coverage thresholds configured:
- Run tests with coverage
- Compare against project standards
- Note any areas below threshold

**Result:** Coverage {percentage}% (threshold: {threshold}%)

### Check 6: Success Criteria Check

Revisit each success criterion from the proposal:

```
| Criterion | Evidence | Met? |
|-----------|----------|------|
| "All API endpoints return correct status codes" | Tests in api.test.ts lines 45-89 all pass | YES |
| "Response time under 200ms" | Performance test in perf.test.ts passes | YES |
```

**Result:** {n}/{total} criteria met

### Check 7: Coherence Check

Verify that design decisions were actually followed:
- Were the specified file structures created?
- Were the interfaces defined as designed?
- Were the architecture decisions respected?
- Any deviations from the design? If so, are they justified?

**Result:** COHERENT / DEVIATIONS FOUND (list them)

## Verdict

Based on ALL checks:

| Verdict | Criteria |
|---------|----------|
| **PASS** | All checks green. All scenarios compliant. All tests pass. All success criteria met. Build clean. |
| **PASS WITH WARNINGS** | All critical checks pass, but minor issues exist (e.g., coverage slightly below threshold, non-critical design deviations). List all warnings. |
| **FAIL** | One or more checks failed. List all failures with details. |

### Issue Classification

If issues are found, classify them:

- **CRITICAL:** Must be fixed before proceeding. Examples: failing tests, missing spec coverage, build errors.
- **WARNING:** Should be fixed but not blocking. Examples: slightly low coverage, minor design deviations.
- **SUGGESTION:** Nice to have. Examples: naming improvements, documentation gaps.

## Save Verification Report

Save to engram:
```
Topic key: flow/{change-name}/verify-report
Project: {project-name}
Content:
  - Verdict: {PASS | PASS WITH WARNINGS | FAIL}
  - Completeness: {result}
  - Spec Compliance: {n}/{total} scenarios
  - Build: {result}
  - Tests: {passed}/{total}
  - Coverage: {percentage}%
  - Success Criteria: {n}/{total}
  - Coherence: {result}
  - Issues: [{classification}: {description}]
```

## Output

Return to orchestrator:
```json
{
  "status": "ok | warning | failed",
  "executive_summary": "Verification {verdict}: {n}/{n} spec scenarios compliant, {n}/{n} tests pass, {n}/{n} success criteria met.",
  "artifacts": [{"name": "verify-report", "topic_key": "flow/{change-name}/verify-report"}],
  "next_recommended": ["flow-archive"] or ["flow-apply (rework)"],
  "risks": ["list any warnings or suggestions"]
}
```

## Human Gate

The orchestrator presents the verification report to the human. The human decides:
- **PASS:** Proceed to archive
- **FAIL:** Send back to Apply for rework (orchestrator identifies which tasks need rework based on the failure details)

## Iron Law

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**

- Every check must be run FRESH (not cached from a previous run)
- "It should work" is not evidence
- "I already tested it" is not evidence — run it again
- If you cannot produce evidence for a claim, the claim is unverified
