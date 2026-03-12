---
name: flow-init
description: Use when starting AI-Flow in a new project or when project context is missing. Detects tech stack, bootstraps persistence, builds skill registry.
---

# Phase 0: Init

## Purpose

Bootstrap the project environment so all subsequent AI-Flow phases have the context they need.

## When to Use

- First time using AI-Flow in a project
- Project context is missing or outdated
- After significant stack changes (new framework, test runner, etc.)

## Steps

### Step 1: Detect Technology Stack

Investigate the project to identify:
- **Language(s):** Look for file extensions, config files (tsconfig.json, Cargo.toml, go.mod, pyproject.toml, etc.)
- **Framework(s):** Check dependencies (package.json, requirements.txt, etc.)
- **Test runner:** Identify the test framework (jest, vitest, pytest, cargo test, go test, etc.)
- **Package manager:** npm, yarn, pnpm, pip, cargo, go modules, etc.
- **Build system:** webpack, vite, esbuild, make, etc.
- **CI/CD:** Check for .github/workflows, .gitlab-ci.yml, Jenkinsfile, etc.

### Step 2: Detect Project Conventions

Look for existing convention files:
- CLAUDE.md, .cursorrules, agents.md, AGENTS.md
- .editorconfig, .prettierrc, .eslintrc
- Existing test patterns (where tests live, naming conventions)
- Git conventions (branch naming, commit message style)

### Step 3: Bootstrap Persistence

AI-Flow uses **engram** for artifact persistence.

1. Verify engram is available (check for mem_save, mem_search tools)
2. If available: persistence mode is `engram`
3. If not available: warn the user that artifacts will not persist across sessions

### Step 4: Build Skill Registry

Scan for available skills:
- Check `~/.claude/skills/` for user-installed skills
- Check the project's `skills/` directory
- List all `flow-*` skills and their status
- Record any domain-specific skills (React, TypeScript, API design, etc.)

### Step 5: Save Project Context

Save the project context to engram:

```
Topic key: flow-init/{project-name}
Project: {project-name}
Content: stack info, conventions, persistence config, skill inventory
```

## Output

Return to orchestrator:
```json
{
  "status": "ok",
  "executive_summary": "Project {name} initialized. Stack: {lang}/{framework}. Test runner: {runner}. Persistence: engram.",
  "artifacts": [{"name": "project-context", "topic_key": "flow-init/{project-name}"}],
  "next_recommended": ["flow-explore"],
  "risks": []
}
```
