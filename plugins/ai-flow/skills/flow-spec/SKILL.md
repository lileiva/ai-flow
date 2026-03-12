---
name: flow-spec
description: Use when writing delta specifications with testable Given/When/Then scenarios for a proposed change. Reads the proposal artifact. Can run in parallel with flow-design.
---

# Phase 3: Spec

## Purpose

Define WHAT the system must do after the change — in testable terms. The scenarios written here become the test cases that drive TDD in the Apply phase.

## Prerequisites

- Proposal artifact MUST exist and be approved

## Reading Context

Read the proposal artifact (REQUIRED):
1. `mem_search(query: "flow/{change-name}/proposal", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read proposal

## Steps

### Step 1: Identify Requirements

From the proposal's scope and intent, extract the requirements. Organize them as:

- **ADDED:** New behaviors the system will have after this change
- **MODIFIED:** Existing behaviors that will change
- **REMOVED:** Existing behaviors that will be eliminated

Each requirement gets a unique ID: `REQ-001`, `REQ-002`, etc.

### Step 2: Write Given/When/Then Scenarios

For EVERY requirement, write at least one testable scenario:

```
**REQ-001:** {requirement description}

Scenario 1: {happy path name}
  Given {initial state or precondition}
  When {action or event}
  Then {expected outcome}

Scenario 2: {edge case name}
  Given {edge case precondition}
  When {action or event}
  Then {expected handling}

Scenario 3: {error case name}
  Given {error-inducing precondition}
  When {action or event}
  Then {expected error behavior}
```

### Step 3: Cross-Reference with Success Criteria

Map each success criterion from the proposal to one or more scenarios. Every success criterion must be covered. If a criterion cannot be mapped, either:
- Write additional scenarios to cover it, OR
- Flag it as untestable and recommend refining the criterion

### Step 4: Validate Testability

For each scenario, verify:
- The "Given" can be set up programmatically (not manually)
- The "When" can be triggered by a test
- The "Then" can be asserted by a test

If a scenario cannot be tested automatically, flag it and suggest how to make it testable.

### Step 5: Use RFC 2119 Keywords

Requirements use precise language:
- **MUST / SHALL:** Non-negotiable requirement
- **SHOULD:** Recommended but can be deviated from with justification
- **MAY:** Optional behavior

### Step 6: Save Spec Artifact

Save to engram:
```
Topic key: flow/{change-name}/spec
Project: {project-name}
Content: all requirements (ADDED/MODIFIED/REMOVED) with Given/When/Then scenarios
```

## Output

Return to orchestrator:
```json
{
  "status": "ok",
  "executive_summary": "Spec for {change-name}: {n} requirements ({added} added, {modified} modified, {removed} removed), {n} scenarios total.",
  "artifacts": [{"name": "spec", "topic_key": "flow/{change-name}/spec"}],
  "next_recommended": ["flow-plan"],
  "risks": ["any requirements that were hard to make testable"]
}
```

## Rules

- Specs describe WHAT, not HOW — no implementation details
- Every requirement MUST have at least one scenario
- Complex requirements SHOULD have multiple scenarios (happy path, edge cases, errors)
- If a requirement cannot be expressed as a Given/When/Then scenario, it is too vague — refine it
- Scenarios MUST be testable — they become the failing tests in the Apply phase
- Do NOT modify any files
