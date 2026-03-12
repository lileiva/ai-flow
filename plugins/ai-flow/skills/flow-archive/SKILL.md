---
name: flow-archive
description: Use when a change has passed verification and needs to be formally closed. Merges delta specs, archives all artifacts to engram, preserves the full decision trail, and cleans up.
---

# Phase 8: Archive

## Purpose

Close out the change and preserve the complete decision trail in engram. After archiving, all artifacts are consolidated and the change is considered complete.

## Prerequisites

- Verification report MUST exist with verdict PASS or PASS WITH WARNINGS
- NEVER archive a change with CRITICAL issues

## Reading Context

Read ALL artifacts to build the archive:

Proposal:
1. `mem_search(query: "flow/{change-name}/proposal", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read proposal

Spec:
1. `mem_search(query: "flow/{change-name}/spec", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read spec

Design:
1. `mem_search(query: "flow/{change-name}/design", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read design

Plan:
1. `mem_search(query: "flow/{change-name}/plan", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read plan

Verify report:
1. `mem_search(query: "flow/{change-name}/verify-report", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read verification report

Apply progress:
1. `mem_search(query: "flow/{change-name}/apply-progress", project: "{project-name}")` → get observation ID
2. `mem_get_observation(id: {observation_id})` → read progress

## Steps

### Step 1: Validate Readiness

- Confirm verification verdict is PASS or PASS WITH WARNINGS
- If PASS WITH WARNINGS: list the warnings in the archive report
- If FAIL or no verification report: REFUSE to archive. Return status "blocked".

### Step 2: Build Archive Report

Create a comprehensive archive report containing:

```markdown
# Archive Report: {change-name}

## Summary
- **Change:** {change-name}
- **Intent:** {one-line from proposal}
- **Completed:** {ISO timestamp}
- **Verdict:** {from verify report}

## Artifact Lineage

All artifacts for this change, with their engram topic keys:

| Phase | Artifact | Topic Key |
|-------|----------|-----------|
| Explore | Exploration analysis | flow/{change-name}/explore |
| Propose | Change proposal | flow/{change-name}/proposal |
| Spec | Delta specifications | flow/{change-name}/spec |
| Design | Technical design | flow/{change-name}/design |
| Plan | Task breakdown | flow/{change-name}/plan |
| Apply | Progress tracking | flow/{change-name}/apply-progress |
| Verify | Verification report | flow/{change-name}/verify-report |
| Archive | This report | flow/{change-name}/archive-report |

## Spec Integration Summary

Delta specs that should be considered part of the project's current state:

### Added Requirements
- REQ-001: {description}
- REQ-002: {description}

### Modified Requirements
- REQ-003: {what changed and why}

### Removed Requirements
- REQ-004: {what was removed and why}

## Architecture Decisions Record

Key decisions made during this change (preserved for future reference):
1. **Decision:** {what} — **Rationale:** {why}
2. ...

## Warnings and Known Issues

{List any warnings from the verification report}

## Statistics
- Tasks completed: {n}/{total}
- Spec scenarios covered: {n}/{total}
- Tests added: {n}
- Files changed: {n} ({created} created, {modified} modified, {deleted} deleted)
```

### Step 3: Save Archive Report to Engram

Save to engram:
```
Topic key: flow/{change-name}/archive-report
Project: {project-name}
Content: the complete archive report
```

### Step 4: Update DAG State

Save final state:
```
Topic key: flow/{change-name}/state
Content:
  change: {change-name}
  current_phase: archived
  completed_phases: [explore, propose, spec, design, plan, apply, verify, archive]
  verdict: {PASS | PASS WITH WARNINGS}
  archived_at: {ISO timestamp}
```

### Step 5: Clean Up

- If git worktrees were used: recommend cleanup (but do not delete — let the human decide)
- If temporary branches exist: note them in the output for the human to handle
- The archived artifacts in engram are the permanent record — they are NEVER deleted

## Output

Return to orchestrator:
```json
{
  "status": "ok",
  "executive_summary": "Archived {change-name}. {n} requirements added, {n} modified, {n} removed. {n} architecture decisions recorded. Verdict: {verdict}.",
  "artifacts": [{"name": "archive-report", "topic_key": "flow/{change-name}/archive-report"}],
  "next_recommended": [],
  "risks": []
}
```

## Rules

- NEVER archive a change with CRITICAL issues — return "blocked"
- The archive is an audit trail — artifacts in engram are never deleted
- Include ALL artifact topic keys in the lineage for future recovery
- Architecture decisions are preserved for future reference — be thorough
- If warnings exist, document them clearly in the archive report
