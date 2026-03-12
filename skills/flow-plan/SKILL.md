---
name: flow-plan
description: Use when breaking a designed change into bite-sized implementation tasks with TDD steps baked into each task. Reads spec and design artifacts. Produces an ordered task list ready for execution.
---

# Phase 5: Plan

## Purpose

Break the design into bite-sized, ordered tasks — each with TDD steps baked in. This is the bridge between "what to build" and "how to build it."

## Prerequisites

- Spec artifact MUST exist
- Design artifact MUST exist

## Reading Context

Read BOTH artifacts (REQUIRED):

Spec:
1. `mem_search(query: "flow/{change-name}/spec", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read spec

Design:
1. `mem_search(query: "flow/{change-name}/design", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read design

## Steps

### Step 1: Map Spec Scenarios to Implementation Order

Review all Given/When/Then scenarios from the spec. Determine the natural implementation order:
- Foundation scenarios first (basic setup, core types)
- Core behavior scenarios next
- Edge cases and error handling after core
- Integration scenarios last

### Step 2: Identify the Tracer Bullet

Find the thinnest possible end-to-end slice that:
- Touches all layers of the system (from entry point to storage/output)
- Validates the core architecture decision
- Can be implemented and tested independently
- Gives meaningful feedback about whether the approach works

Mark this as **Task 0: Tracer Bullet** — it always executes first.

### Step 3: Break Into Tasks

Create tasks that are **2-5 minutes each** (for an AI sub-agent). Each task:

```markdown
### Task {batch}.{number}: {descriptive name}

**Spec reference:** REQ-{id}, Scenario {n}
**Files:** {exact file paths to create or modify}
**Dependencies:** Task {x.y} must complete first

**TDD Steps:**
1. **Write test:** Create test in {test-file-path} that asserts {behavior from scenario}
2. **Verify RED:** Run `{test-command}`. Expect failure: "{expected failure message}"
3. **Implement:** In {file-path}, write {brief description of implementation}
4. **Verify GREEN:** Run `{test-command}`. Expect all tests pass.
5. **Refactor:** {specific refactoring if needed, or "No refactoring needed"}
6. **Commit:** `{commit message referencing the spec scenario}`

**Acceptance:** {how to know this task is done}
```

### Step 4: Group Into Batches

Organize tasks into execution batches:

- **Batch 0:** Tracer bullet (always first, always alone)
- **Batch 1:** Foundation (types, interfaces, base setup)
- **Batch 2:** Core implementation (main behavior)
- **Batch 3:** Edge cases and error handling
- **Batch 4:** Integration and polish
- **Batch 5:** Cleanup (remove temporary scaffolding, update docs)

Within a batch, mark which tasks can run in parallel (independent) vs. must run sequentially (dependent).

### Step 5: Validate Coverage

Cross-reference:
- Every spec scenario must be covered by at least one task
- Every design file change must appear in at least one task
- Every success criterion from the proposal must be verifiable after all tasks complete

If anything is missing, add tasks to fill the gaps.

### Step 6: Plan Review

Before finalizing, critically review the plan:
- Are tasks small enough? (If any task seems like more than 5 minutes, split it)
- Are dependencies correct? (Can each task actually run after its prerequisites?)
- Are the TDD steps specific enough? (Could a sub-agent execute them without guessing?)
- Is the tracer bullet truly the thinnest slice?

### Step 7: Save Plan Artifact

Save to engram:
```
Topic key: flow/{change-name}/plan
Project: {project-name}
Content: ordered task list with TDD steps, grouped by batch
```

## Output

Return to orchestrator:
```json
{
  "status": "ok",
  "executive_summary": "Plan for {change-name}: {n} tasks in {n} batches. Tracer bullet: {description}. Covers {n}/{n} spec scenarios.",
  "artifacts": [{"name": "plan", "topic_key": "flow/{change-name}/plan"}],
  "next_recommended": ["flow-apply"],
  "risks": ["any tasks that seem risky or underspecified"]
}
```

## Human Gate

After the orchestrator presents the plan summary, the human must approve before execution begins. The orchestrator handles this gate.

## Rules

- Every task MUST have TDD steps — no exceptions
- Tasks should be 2-5 minutes each — if longer, split them
- The tracer bullet is ALWAYS Batch 0 and executes first
- Include exact file paths and test commands — no vagueness
- Spec scenarios drive the test writing — each test references its scenario
- Do NOT write code — this is a plan, not an implementation
- Do NOT modify any files
