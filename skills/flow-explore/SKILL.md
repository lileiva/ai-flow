---
name: flow-explore
description: Use when investigating a problem space or codebase area before committing to an approach. Combines brainstorming with codebase exploration to produce candidate approaches with trade-offs.
---

# Phase 1: Brainstorm & Explore

## Purpose

Understand the problem space and the existing codebase before committing to an approach. This phase merges creative brainstorming with systematic codebase investigation.

## Prerequisites

- Project context should exist (run `flow-init` if missing)
- A topic or problem statement from the user

## Reading Context

If project context exists in engram:
1. `mem_search(query: "flow-init/{project-name}", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read project context

## Steps

### Step 1: Understand the Problem

Ask clarifying questions about:
- What problem are we solving?
- What are the constraints (performance, compatibility, timeline)?
- What does success look like?
- Who are the stakeholders or consumers of this change?

Ask questions **one at a time**. Prefer multiple-choice where possible to reduce friction.

### Step 2: Investigate the Codebase

Explore the relevant areas of the codebase:
- What exists today that relates to this problem?
- What patterns does the codebase already use?
- Where would changes need to land?
- What are the integration points?
- What tests exist for the affected areas?

Document findings as you go. Be specific — include file paths, function names, and line numbers.

### Step 3: Generate Candidate Approaches

Produce **2-3 candidate approaches**, each with:

| Field | Description |
|-------|-------------|
| **Name** | Short descriptive name |
| **Description** | What this approach does and how |
| **Pros** | Advantages of this approach |
| **Cons** | Disadvantages and limitations |
| **Complexity** | Low / Medium / High |
| **Risk** | What could go wrong |
| **Affected areas** | Files and modules that would change |

### Step 4: Make a Recommendation

Recommend one approach (or a hybrid) with clear reasoning. Explain why this approach best balances the trade-offs given the constraints.

### Step 5: Save Exploration Artifact

Save to engram:
```
Topic key: flow/{change-name}/explore
Project: {project-name}
Content: problem analysis, codebase findings, candidate approaches, recommendation
```

## Output

Return to orchestrator:
```json
{
  "status": "ok",
  "executive_summary": "Explored {topic}. Recommended approach: {name}. Key trade-off: {summary}.",
  "artifacts": [{"name": "exploration", "topic_key": "flow/{change-name}/explore"}],
  "next_recommended": ["flow-propose"],
  "risks": ["list any significant risks discovered"]
}
```

## Rules

- Do NOT modify any files during exploration
- Do NOT commit to an approach — present options for the human to decide
- Be honest about uncertainty — if you don't know something, say so
- Scale depth to the problem: simple problems get brief exploration, complex ones get thorough analysis
