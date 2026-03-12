---
name: flow-propose
description: Use when committing to an approach and defining a change formally. Creates a proposal with intent, scope, risks, rollback plan, and success criteria. Requires exploration or direct user direction.
---

# Phase 2: Propose

## Purpose

Commit to a single approach and define the change formally. The proposal is the root artifact — all downstream phases depend on it.

## Prerequisites

- Exploration artifact should exist (from `flow-explore`), OR the user has provided direct guidance on the approach
- The change name must be established

## Reading Context

Read the exploration artifact (if it exists):
1. `mem_search(query: "flow/{change-name}/explore", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read exploration analysis

## Steps

### Step 1: Select the Approach

Based on the exploration analysis (or user direction):
- Select the best approach, or synthesize a hybrid from multiple candidates
- State clearly WHY this approach was chosen over alternatives

### Step 2: Write the Proposal

The proposal MUST contain all of the following sections:

#### Intent
What this change accomplishes and WHY it matters. Not just "what" — the business or technical motivation.

#### Scope — In
What is included in this change. Be specific: features, behaviors, files, APIs.

#### Scope — Out
What is explicitly EXCLUDED. This prevents scope creep. If something is related but not part of this change, list it here.

#### Approach
How the change will be implemented at a high level. Not the full design — just enough to understand the strategy.

#### Affected Areas
Concrete file paths and modules that will be created, modified, or deleted.

#### Risks
What could go wrong. For each risk:
- **Risk:** Description
- **Likelihood:** Low / Medium / High
- **Impact:** Low / Medium / High
- **Mitigation:** How to reduce or handle this risk

#### Rollback Plan
How to undo this change if it needs to be reverted. Every proposal MUST have a rollback plan.

#### Success Criteria
Measurable conditions that define "done." These will be checked during the Verify phase. Each criterion should be objectively verifiable (not "works well" but "all API endpoints return correct status codes and response shapes").

### Step 3: Save Proposal Artifact

Save to engram:
```
Topic key: flow/{change-name}/proposal
Project: {project-name}
Content: the complete proposal with all sections
```

### Step 4: Update DAG State

Save state:
```
Topic key: flow/{change-name}/state
Content: current_phase: propose, status: pending-approval
```

## Output

Return to orchestrator:
```json
{
  "status": "ok",
  "executive_summary": "Proposal for {change-name}: {one-line summary of intent}. Scope: {n} files affected. {n} risks identified.",
  "artifacts": [{"name": "proposal", "topic_key": "flow/{change-name}/proposal"}],
  "next_recommended": ["flow-spec", "flow-design"],
  "risks": ["list key risks from the proposal"]
}
```

## Human Gate

After the orchestrator presents the proposal summary, the human must approve before proceeding to Spec and Design phases. The orchestrator handles this gate — the sub-agent just produces the proposal.

## Rules

- Every proposal MUST have a rollback plan
- Every proposal MUST have measurable success criteria
- Scope-Out is as important as Scope-In — be explicit about what's excluded
- Do NOT start designing the solution in detail — that's the Design phase's job
- If the exploration recommended against proceeding, include that assessment honestly in the Risks section
