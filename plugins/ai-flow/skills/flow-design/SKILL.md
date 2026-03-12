---
name: flow-design
description: Use when creating the technical design for a proposed change. Defines architecture decisions, file changes, interfaces, and testing strategy. Reads the proposal. Can run in parallel with flow-spec.
---

# Phase 4: Design

## Purpose

Define HOW the system will implement the change — the technical blueprint. Every architecture decision must have a rationale.

## Prerequisites

- Proposal artifact MUST exist and be approved
- Spec artifact MAY exist (if running in parallel with spec, it may not be available yet)

## Reading Context

Read the proposal artifact (REQUIRED):
1. `mem_search(query: "flow/{change-name}/proposal", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read proposal

Read the spec artifact (OPTIONAL — may not exist if running in parallel):
1. `mem_search(query: "flow/{change-name}/spec", project: "{project-name}")` → get observation ID
2. If found: `mem_get_observation(id: {observation_id})` → read spec

## Steps

### Step 1: Explore Current Architecture

Before designing the change, understand the current system:
- Read the affected files listed in the proposal
- Understand existing patterns, conventions, and abstractions
- Identify integration points and dependencies
- Note any technical debt or constraints

### Step 2: Define Architecture Decisions

For each significant decision, document:

```
**Decision:** {what was decided}
**Rationale:** {why this choice over alternatives}
**Alternatives considered:** {what else was considered and why it was rejected}
**Trade-offs:** {what we gain and what we give up}
```

Use the project's ACTUAL patterns, not generic best practices. If the codebase uses pattern X, design with pattern X unless there's a compelling reason to deviate.

### Step 3: Specify File Changes

List every file that will be:
- **Created:** New files with their purpose and location
- **Modified:** Existing files and what changes in them
- **Deleted:** Files being removed and why

Include the file path and a brief description of each change.

### Step 4: Define Interfaces and Data Flow

- Define new interfaces, types, or contracts being introduced
- Document data flow through the system for the new behavior
- Specify API contracts (request/response shapes) if applicable
- Define error handling strategy

### Step 5: Write Testing Strategy

Map the design to the spec scenarios:
- Which scenarios become **unit tests**? (isolated component behavior)
- Which become **integration tests**? (component interaction)
- Which need **end-to-end tests**? (full system behavior)
- What **mocking/stubbing** strategy is needed? (prefer real dependencies)
- Where do test files live? (follow existing project conventions)

### Step 6: Save Design Artifact

Save to engram:
```
Topic key: flow/{change-name}/design
Project: {project-name}
Content: architecture decisions, file changes, interfaces, data flow, testing strategy
```

## Output

Return to orchestrator:
```json
{
  "status": "ok",
  "executive_summary": "Design for {change-name}: {n} files affected ({created} new, {modified} modified, {deleted} deleted). {n} architecture decisions. Testing: {n} unit, {n} integration, {n} e2e.",
  "artifacts": [{"name": "design", "topic_key": "flow/{change-name}/design"}],
  "next_recommended": ["flow-plan"],
  "risks": ["any architectural risks or technical debt concerns"]
}
```

## Rules

- Every decision MUST have a rationale — "it's best practice" is not a rationale
- Use the project's existing patterns unless there's a documented reason to deviate
- The design describes HOW, not WHAT (that's the spec's job)
- Include concrete file paths, not vague module references
- Do NOT write code — this is a design document, not an implementation
- Do NOT modify any files
