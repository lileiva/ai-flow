# Engram Convention for AI-Flow

## Artifact Naming

All AI-Flow artifacts use deterministic topic keys for engram persistence:

| Artifact | Topic Key Pattern | Example |
|----------|------------------|---------|
| Project context | `flow-init/{project-name}` | `flow-init/my-app` |
| Exploration | `flow/{change-name}/explore` | `flow/auth-system/explore` |
| Proposal | `flow/{change-name}/proposal` | `flow/auth-system/proposal` |
| Spec | `flow/{change-name}/spec` | `flow/auth-system/spec` |
| Design | `flow/{change-name}/design` | `flow/auth-system/design` |
| Plan | `flow/{change-name}/plan` | `flow/auth-system/plan` |
| Apply progress | `flow/{change-name}/apply-progress` | `flow/auth-system/apply-progress` |
| Verify report | `flow/{change-name}/verify-report` | `flow/auth-system/verify-report` |
| Archive report | `flow/{change-name}/archive-report` | `flow/auth-system/archive-report` |
| DAG state | `flow/{change-name}/state` | `flow/auth-system/state` |

## Two-Step Recovery (Mandatory)

Engram search results are truncated. Always use two steps:

1. **Search**: `mem_search(query: "{topic_key}", project: "{project}")` → get observation ID
2. **Retrieve**: `mem_get_observation(id: {observation_id})` → get full content

Never trust truncated search results as complete artifacts.

## Writing Artifacts

When saving an artifact:

1. Use `mem_save` with the deterministic topic key
2. Include the `project` field (derived from project directory name)
3. Structure the content as markdown with clear sections
4. Always include a metadata header:

```
## Metadata
- **Change**: {change-name}
- **Phase**: {phase-name}
- **Created**: {ISO timestamp}
- **Status**: draft | approved | superseded
```

## Upsert Behavior

Saving to an existing topic key overwrites the previous content. This is intentional — each artifact has exactly one current version. The engram history preserves previous versions.

## Cross-Reference Convention

When an artifact references another artifact, use the topic key:

```
See proposal: `flow/{change-name}/proposal`
Derived from spec scenario: `flow/{change-name}/spec` → REQ-003 → Scenario 2
```
