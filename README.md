# AI-Flow

A unified AI-assisted development workflow plugin for [Claude Code](https://claude.ai/claude-code).

AI-Flow orchestrates structured development through DAG-based phases: exploration, proposal, specification, design, planning, implementation (with TDD), verification, and archival — with human review gates at critical points.

For the full reference document, see [unified-ai-dev-flow.md](unified-ai-dev-flow.md). For version history, see [CHANGELOG.md](CHANGELOG.md).

## Installation

### Prerequisites

- [Claude Code](https://claude.ai/claude-code) v1.0.33+
- [Engram MCP server](https://github.com/anthropics/engram) for artifact persistence (bundled via `.mcp.json`)

### Step 1: Add the marketplace

Open Claude Code and run:

```
/plugin marketplace add lileiva/ai-flow
```

### Step 2: Install the plugin

```
/plugin install ai-flow@ai-flow
```

### Step 3: Initialize your project

```
/flow-init
```

This detects your tech stack, bootstraps persistence, and creates `.ai-flow.json` with your preferences.

### Step 4: Verify

Run `/help` and confirm the `flow-` commands and skills appear.

### Updating

```
/plugin update ai-flow@ai-flow
```

## Quick Start

A typical workflow looks like this:

```
/flow-new add-user-auth      # Explore the problem space, then create a proposal
                              # → You approve or revise the proposal

/flow-spec                    # Write Given/When/Then scenarios
/flow-design                  # Create technical design (can run in parallel with spec)

/flow-plan                    # Break work into batched tasks with TDD steps
                              # → You approve or revise the plan

/flow-apply                   # Execute tasks: tracer bullet first, then batches
                              # → You review after tracer bullet

/flow-verify                  # Run compliance checks and test suite
                              # → You approve or send back for rework

/flow-archive                 # Archive artifacts and close the change
```

Or use the shortcuts:

```
/flow-ff add-user-auth       # Fast-forward: propose → spec + design → plan
/flow-continue add-user-auth  # Resume from the last completed phase
```

## Configuration

AI-Flow uses `.ai-flow.json` at the project root for per-project settings. Created automatically by `/flow-init`.

```json
{}
```

## Commands

User-invokable commands (type directly):

| Command | Description |
|---------|-------------|
| `/flow-new <name>` | Start a new change — explore → propose → human gate |
| `/flow-ff <name>` | Fast-forward — propose → spec + design (parallel) → plan |
| `/flow-continue <name>` | Resume from last completed phase |

## Skills

Model-invoked skills (Claude uses these automatically):

| Skill | Phase | Description |
|-------|-------|-------------|
| `flow-init` | 0 | Bootstrap AI-Flow in your project |
| `flow-explore` | 1 | Brainstorm and explore a problem space |
| `flow-propose` | 2 | Create a formal change proposal |
| `flow-spec` | 3 | Write delta specifications with scenarios |
| `flow-design` | 4 | Create technical design |
| `flow-plan` | 5 | Break down into implementation tasks |
| `flow-apply` | 6 | Execute tasks with TDD and reviews |
| `flow-verify` | 7 | Verify implementation against specs |
| `flow-archive` | 8 | Archive completed change |
| `flow-debug` | Any | Systematic debugging loop |

## Agents

Each phase is executed by a specialized agent with domain expertise and scoped tool access:

| Agent | Phase | Tool Access | Role |
|-------|-------|-------------|------|
| `initializer` | 0 | Read-only | Detects stack, conventions, creates `.ai-flow.json` |
| `explorer` | 1 | Read-only | Brainstorms approaches, investigates codebase |
| `proposer` | 2 | Read-only | Writes formal proposals with risks and rollback |
| `specifier` | 3 | Read-only | Writes Given/When/Then scenarios from requirements |
| `designer` | 4 | Read-only | Architecture decisions, interfaces, testing strategy |
| `planner` | 5 | Read-only | Task breakdown with TDD steps in batches |
| `implementer` | 6 | Full | Writes tests first, then code (RED-GREEN-REFACTOR) |
| `verifier` | 7 | Read + tests | Spec compliance matrix, quality gate |
| `archivist` | 8 | Read + engram | Consolidates artifacts, closes change |
| `debugger` | Any | Full | Root-cause-first investigation with TDD fix |
| `orchestrator` | — | Delegates | Coordinates all agents, manages human gates |

## DAG

```
            proposal
               |
       +-------+-------+
       |               |
     spec           design    <- run in parallel
       |               |
       +-------+-------+
               |
             plan
               |
             apply
               |
            verify
               |
           archive
```

## Hooks

Defined in `plugins/ai-flow/hooks/hooks.json`.

## MCP Servers

The plugin bundles an engram MCP server configuration in `.mcp.json`. This ensures artifact persistence is available without manual setup. The server uses `npx engram-mcp` and scopes the project to the plugin root.

## Human Review Gates

| Gate | After | Options |
|------|-------|---------|
| Proposal approval | Phase 2 | Approve / Revise / Reject |
| Plan approval | Phase 5 | Approve / Revise / Reject |
| Tracer bullet feedback | Phase 6 (batch 0) | Continue / Adjust |
| Verification approval | Phase 7 | Archive / Rework |

## Project Structure

```
plugins/ai-flow/
  .claude-plugin/
    plugin.json              # Plugin metadata (name, version, author)
  .mcp.json                  # Bundled engram MCP server config
  hooks/
    hooks.json               # Session hooks
  commands/
    flow-new.md              # /flow-new command
    flow-ff.md               # /flow-ff command
    flow-continue.md         # /flow-continue command
  skills/
    flow-init/SKILL.md       # Phase 0: Project bootstrap
    flow-explore/SKILL.md    # Phase 1: Problem exploration
    flow-propose/SKILL.md    # Phase 2: Change proposal
    flow-spec/SKILL.md       # Phase 3: Delta specification
    flow-design/SKILL.md     # Phase 4: Technical design
    flow-plan/SKILL.md       # Phase 5: Task planning
    flow-apply/SKILL.md      # Phase 6: TDD implementation
    flow-verify/SKILL.md     # Phase 7: Verification
    flow-archive/SKILL.md    # Phase 8: Archival
    flow-debug/SKILL.md      # Ad-hoc debugging
    _shared/
      engram-convention.md   # Engram topic key naming convention
      persistence-contract.md # Sub-agent context protocol
      tdd-protocol.md        # RED-GREEN-REFACTOR protocol
  agents/
    orchestrator.md          # Coordinator agent
    initializer.md           # Phase 0 agent
    explorer.md              # Phase 1 agent
    proposer.md              # Phase 2 agent
    specifier.md             # Phase 3 agent
    designer.md              # Phase 4 agent
    planner.md               # Phase 5 agent
    implementer.md           # Phase 6 agent
    verifier.md              # Phase 7 agent
    archivist.md             # Phase 8 agent
    debugger.md              # Debug agent
```

## Evals

AI-Flow ships an offline-graded eval suite under `plugins/ai-flow/evals/` (since 4.0.0-alpha.1). It runs 5 cases through `claude plugin eval`, grades every run from its trace and workspace, and compares the result with a recorded baseline. The suite measures outcomes (hidden acceptance tests), TDD adherence, phase order, artifact completeness, tokens per phase, cost and wall time. Full details are in [`plugins/ai-flow/evals/README.md`](plugins/ai-flow/evals/README.md).

### Prerequisites

- Claude Code >= 2.1.301 and git >= 2.31.
- Node 26 from nvm: `nvm install 26 && nvm use 26`. The runner puts the nvm Node 26 `bin/` dir and its npm package dir on the eval child's `PATH` (strategy R1), so agents can run `npm test` inside the eval sandbox. No other Node install is used.
- A one-time cache build (needs network): `node plugins/ai-flow/evals/tooling/prepare.mjs`.
- Check everything with `node plugins/ai-flow/evals/tooling/preflight.mjs` (exit 3 with guidance when something is missing).

### Running

```bash
# Full suite: 5 cases x 3 runs on sonnet
bash plugins/ai-flow/evals/run.sh

# Subsets while iterating (1 run each by default)
bash plugins/ai-flow/evals/run.sh --case a --case d
bash plugins/ai-flow/evals/run.sh --tag smoke

# Alpha gate: full suite, 3 runs, compared with baselines/v3.4.0-<model>.json
bash plugins/ai-flow/evals/run.sh --gate

# Record a baseline at the v3.4.0 tag (also measures the SessionStart cost)
bash plugins/ai-flow/evals/run.sh --plugin-ref v3.4.0 --promote v3.4.0
```

There is no cost cap by default: evals run on a Claude Code subscription, so cost, tokens and duration are recorded as metrics, never used as gates. Pass `--max-cost-usd X` to forward the native CLI ceiling (the run is then marked incomplete if the ceiling is reached). The real constraint is the subscription rate limit: a rate-limited run is a harness error that stops the runner (exit 5, not retried); after the window resets, `--resume <results-dir>` re-runs only the missing slots. Preflight warns when recent utilization is high. Use `--model opus` (or `AIFLOW_EVAL_MODEL`) to switch models and `--dry-run` to print the plan without spawning anything.

### Comparing with a baseline

```bash
node plugins/ai-flow/evals/tooling/compare.mjs --baseline plugins/ai-flow/evals/baselines/v3.4.0-sonnet.json --candidate plugins/ai-flow/evals/baselines/v3.4.0-sonnet.json
```

Replace `--candidate` with a run's `summary.json`. A metric regresses when it is worse than the baseline mean by more than 1 baseline stdev; for rate metrics (pass rates, TDD score, phase order, artifact completeness) the threshold is at least 0.34, so a single flipped run out of 3 is not flagged. Any regression exits 1. Baselines are per model: `baselines/v3.4.0-sonnet.json` is the reference for iteration and alpha gates, and `baselines/v3.4.0-opus.json` is the reference for the final 4.0.0 gate. Comparing across models or Claude Code major versions is refused (exit 6) unless `--allow-env-mismatch` is passed.

### Known gaps

- Human gates are auto-approved by an unattended policy appended to the system prompt, which is not how gates behave in real use.
- Engram is mocked (`plugin_engram_engram`), so artifacts are graded from `mem_save` payloads, not from a real store.
- Subagents launched by another subagent (for example when the flow is delegated to the `ai-flow:orchestrator` agent) are not in the trace, so their TDD, artifact and tool-use grades are recorded as n/a.
- As shipped, v3.4.0's SessionStart hook never runs on Unix (`run-hook.cmd` is not executable, exit 126), so its injection is 0 tokens. The baseline records both this as-shipped value and the intended cost measured on temp plugin copies (about 2.8k hook tokens on sonnet).

## License

MIT
