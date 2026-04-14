---
name: flow-explore
description: Investigate a problem space by combining brainstorming with codebase exploration. Produces 2-3 candidate approaches with trade-offs and a recommendation. Use before committing to an approach.
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke: "Exploring ideas before committing to a change"
---

This phase is handled by the **explorer** agent.

Delegate to the `explorer` agent with the topic and project name. The agent will:
1. Read any existing project context from engram
2. **Ask the user 2-4 clarifying questions** via `AskUserQuestion` to understand goals, constraints, success criteria, and scope boundaries before investigating the codebase
3. Investigate the codebase for existing patterns and integration points, focused by the user's answers
4. Generate 2-3 candidate approaches with pros, cons, complexity, and risk
5. Present a **readiness gate**: the user can proceed to proposal, request refinement, or take a different angle
6. If the user requests refinement, conduct up to 3 iterative refinement rounds with targeted follow-up questions before proceeding
7. Recommend one approach with clear reasoning
8. Save exploration to engram under `flow/{change-name}/explore`
9. Save a **brainstorm artifact** to engram under `flow/{change-name}/brainstorm` containing the refined problem statement, selected approach, scope decisions, and iteration summary

**Interactive:** This phase pauses to ask the user questions. The user's answers directly shape which parts of the codebase are explored and which approaches are generated. The iterative discovery loop allows the user to refine approaches before committing to a proposal.

**Outputs:** Two artifacts -- `explore` (codebase investigation) and `brainstorm` (refined problem and approach from user interaction). The brainstorm artifact is optional input for the proposer.

## OpenSpace Integration (optional)

If the OpenSpace MCP server is connected, call `search_skills` before investigating the codebase:
- `query`: keywords from the topic being explored
- `source`: `"local"`
- `limit`: `10`

If relevant skills are returned, factor them into your candidate approaches. If OpenSpace is not connected or returns empty results, proceed normally — this step is additive, not blocking.

See `agents/explorer.md` for the full protocol.
