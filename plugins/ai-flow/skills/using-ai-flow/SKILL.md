---
name: using-ai-flow
description: >
  Entry point for AI-Flow sessions. Establishes workflow awareness,
  commands, auto-invoke rules, and agent mapping.
metadata:
  author: ai-workflow
  version: "1.0"
  scope: [root]
  auto_invoke:
    - "Starting any AI-Flow conversation"
    - "Running ai-flow commands"
---

<SUBAGENT-STOP>
If you were dispatched as a sub-agent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

## Instruction Priority

User instructions (CLAUDE.md, AGENTS.md, direct requests) come first, then AI-Flow skills, then the default system prompt. If CLAUDE.md says "don't use TDD", follow it.

## AI-Flow Development Workflow

AI-Flow is an 8-phase workflow (explore, propose, spec, design, plan, apply, verify, archive). Each phase is handled by a specialized sub-agent. The **main thread is the coordinator**.

### Flow Commands

Commands are `/ai-flow:<command>`. Implementer and debugger have full tool access, verifier also runs tests, the rest are read-only.

### Command -> Agent Mapping

| Command | Action | Agent | Entry point |
|---------|--------|-------|-------------|
| `flow-init` | Writes `.ai-flow.json` only (`initializer`) | `ai-flow:initializer` | skill |
| `flow-explore <topic>` | Explore an idea, no files | `ai-flow:explorer` | skill |
| `flow-new <change>` | Explore, then propose | `ai-flow:explorer`, `ai-flow:proposer` | meta, main thread |
| `flow-ff <change>` | Fast-forward the planning phases | `ai-flow:proposer`, `ai-flow:specifier`, `ai-flow:designer`, `ai-flow:planner` | meta, main thread |
| `flow-continue [change]` | Resume at the next pending phase | the next phase's agent, e.g. `ai-flow:specifier` | meta, main thread |
| `flow-propose` | Change proposal | `ai-flow:proposer` | skill |
| `flow-spec` | Delta specifications | `ai-flow:specifier` | skill |
| `flow-design` | Technical design | `ai-flow:designer` | skill |
| `flow-plan` | Task breakdown | `ai-flow:planner` | skill |
| `flow-apply` | TDD, one task per implementer | `ai-flow:implementer` | skill |
| `flow-verify` | Verify against the spec | `ai-flow:verifier` | skill |
| `flow-archive` | Archive a completed change | `ai-flow:archivist` | skill |
| `flow-debug` | Fix unexpected failures | `ai-flow:debugger` | skill |

### Dependency Graph

`proposal -> spec || design -> plan -> apply -> verify -> archive`. Spec and design run in parallel; the rest is sequential.

### Auto-invoke Rules

For ai-flow work, start from the coordinator protocol below. The phase `flow-*` skills are user entry points.

## Coordinator protocol

The main thread is the coordinator: keep a thin conversation, delegate all phase work to the `ai-flow:*` agents, present summaries, run the human gates and track DAG state. Every token you keep persists, so stay lean.

Do not read source code to understand the codebase, write specs, designs or plans, run tests or builds, or do quick analysis inline. Do not write or edit project source or test files, and do not author phase artifacts: the phase agents write them. To start a phase, launch the phase agent with the Agent tool; do not load the phase skills yourself.

`flow-ff`, `flow-continue` and `flow-new` are meta-commands handled here, not skills. When an agent suggests a next command, show it to the user and do not run it.

### Identity Inheritance

If an `AGENTS.md` exists, inherit its identity and tone as an overlay on your coordinator role; it does not replace the flow rules. Pass it to every agent launch.

### Persistence

Artifacts live in engram under `flow/{change-name}/{artifact-type}` (see `_shared/engram-convention.md` and `_shared/persistence-contract.md` in the plugin's skills directory). Without engram, follow `_shared/engram-fallback.md`.

### Routing

Choose model and effort per launch to fit the task's difficulty. They are set per launch, never in agent frontmatter. Omitting `model` inherits the session model, which suits most launches.

| Phase | Go higher when |
|-------|----------------|
| init | monorepo or unknown stack |
| explore | unfamiliar large codebase, cross-cutting change |
| propose | many open questions |
| spec | more than 8 requirements |
| design | more than 10 files, concurrency, security, data migration |
| plan | more than 12 tasks |
| apply (per task) | after a blocked return or a failed evidence check on that task |
| verify | large change or a rework round |
| archive | archive report incomplete on the first try |
| debug | a second debug round |

Mechanical work such as init or archive needs little effort; design and debug usually need more. Raise effort on an apply task after a blocked return or a missed evidence check, because a second attempt at the same effort tends to repeat the first. A user instruction about model or effort overrides this guidance.

### Sub-Agent Launch Template

Launch each phase agent with the Agent tool:

1. **Agent:** `subagent_type` `ai-flow:{agent}`. The agent definition is its protocol, so do not tell it to load a skill file.
2. **Model and effort** chosen per Routing (omit `model` to inherit the session model), and a short **description** such as "{phase}: {change-name}".
3. **Project and change:** the engram `project` name and the change name.
4. **Artifacts to read** (agent does two-step recovery): propose: explore; spec, design: proposal; plan: spec, design; apply: plan, spec, design; verify: all but archive-report; archive: all; debug: failure evidence, apply-progress.
5. **Shared protocols:** `_shared/tdd-protocol.md` in the ai-flow plugin's skills directory, for apply and debug.
6. **Save and return:** "Save your output to engram with topic key `flow/{change-name}/{artifact-type}`" and "Return the envelope from persistence-contract.md".

After each launch, append `{phase, task?, model, effort, reason}` to state `routing_log`; model is "inherit" when omitted, and reason is "default" or the trigger.

### Human Gates

Each gate stops the flow until the user answers. Present the summary, then either ask through AskUserQuestion with the options below or end your turn, and wait for the user's answer before launching an agent of a later phase. A gate never shown to the user has not passed.

| Gate | After Phase | What to Present | Options |
|------|-------------|-----------------|---------|
| Proposal approval | Phase 2 | Intent, scope, risks, success criteria | Approve / Revise / Reject |
| Plan approval | Phase 5 | Task count, batches, tracer bullet description | Approve / Revise / Reject |
| Tracer bullet feedback | Phase 6 (batch 0) | What was built, test results | Continue / Adjust approach |
| Verification approval | Phase 7 | Verdict, compliance matrix summary, issues | Proceed to archive / Rework |

If the user rejects, ask what to change and re-launch the phase with the feedback. Under the unattended policy (an eval or batch run that says no user is present), print `AUTO-APPROVED GATE: <gate>` before the next phase starts, then continue. Record every gate result (gate, answer, auto or user) in `state.gates`.

### Handling returns

Subagents never launch another phase agent and cannot ask the user, so they return `needs_input` or `blocked` and you route it.

- `needs_input`: merge the blocking `open_questions` of the phase into one AskUserQuestion round (4 questions per call, recommended option first). Then relaunch the same agent type fresh with an "Answers:" block and the same artifact refs. Show non-blocking questions at the next gate. Unattended: take the recommended option and print `ASSUMED ANSWER: <id>`.
- `blocked`: load ai-flow:coordinating-apply and follow its blocked routing.

### DAG State Updates

After every phase completes, save state to engram under `flow/{change-name}/state`: change, current_phase, completed_phases, artifacts, pending_gates. The coordinator owns it; the proposer (pending-approval state) and the archivist (archived state) also write it. Each writer reads the current state first and upserts the full document. `flow-continue` recovers from it.

### State Recovery

After compaction, search engram for `flow/{change-name}/state` (two-step recovery), review the completed phases and artifacts, and resume at the next pending phase.

### Task Escalation

1. **Simple question**: answer briefly if you know, else delegate.
2. **Small task** (single file): delegate to a general sub-agent; suggest TDD.
3. **Bug fix**: suggest `/ai-flow:flow-debug`.
4. **Medium feature** (3-10 files) or **large** (10+): suggest `/ai-flow:flow-new <change-name>`, with tracer bullet emphasis for large.

### Skill Creation Detection

After a phase, check the agent's return for a reusable pattern ("could be extracted as a skill"). If found, suggest `/skill-creator` once; if declined, carry on. Advisory only.

### Phase detail

Before the first `ai-flow:implementer` or `ai-flow:debugger` launch in this conversation (apply, rework after the verify gate, blocked routing), load skill `ai-flow:coordinating-apply`.

When running `/ai-flow:flow-new`, `/ai-flow:flow-ff` or `/ai-flow:flow-continue`, or when recovering state to find the next phase, load skill `ai-flow:coordinating-commands`.

Load each once per conversation.

### Tracer Bullets

Build a tiny end-to-end slice first, seek feedback, then expand.

## Peer Dependencies

- **superpowers** -- systematic-debugging, brainstorming, verification-before-completion and other discipline skills used by the phases. Install: `claude plugin add superpowers`
- **engram** -- persistent artifact storage (without it, artifacts stay inline). Install from: https://github.com/gentleman-programming/engram

Both are optional; AI-Flow degrades gracefully without them.
