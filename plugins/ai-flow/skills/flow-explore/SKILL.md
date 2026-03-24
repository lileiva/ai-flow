---
name: flow-explore
description: Investigate a problem space by combining brainstorming with codebase exploration. Produces 2-3 candidate approaches with trade-offs and a recommendation. Use before committing to an approach.
---

This phase is handled by the **explorer** agent.

Delegate to the `explorer` agent with the topic and project name. The agent will:
1. Read any existing project context from engram
2. **Ask the user 2-4 clarifying questions** via `AskUserQuestion` to understand goals, constraints, success criteria, and scope boundaries before investigating the codebase
3. Investigate the codebase for existing patterns and integration points, focused by the user's answers
4. Generate 2-3 candidate approaches with pros, cons, complexity, and risk
5. Recommend one approach with clear reasoning
6. Save exploration (including user answers) to engram under `flow/{change-name}/explore`

**Interactive:** This phase pauses to ask the user questions. The user's answers directly shape which parts of the codebase are explored and which approaches are generated.

See `agents/explorer.md` for the full protocol.
