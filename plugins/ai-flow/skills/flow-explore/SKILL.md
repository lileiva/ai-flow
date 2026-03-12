---
name: flow-explore
description: Investigate a problem space by combining brainstorming with codebase exploration. Produces 2-3 candidate approaches with trade-offs and a recommendation. Use before committing to an approach.
---

This phase is handled by the **explorer** agent.

Delegate to the `explorer` agent with the topic and project name. The agent will:
1. Clarify the problem, constraints, and success criteria
2. Investigate the codebase for existing patterns and integration points
3. Generate 2-3 candidate approaches with pros, cons, complexity, and risk
4. Recommend one approach with clear reasoning
5. Save exploration to engram under `flow/{change-name}/explore`

See `agents/explorer.md` for the full protocol.
