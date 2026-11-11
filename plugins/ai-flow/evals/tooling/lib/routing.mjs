// Routing metrics (B4 REQ-013 S1 routing_coverage, REQ-003 S3). Informational: not in the D-2 blocking set (R6, R12).
import { roles } from './config.mjs';

const AGENT_TOOLS = new Set(['Agent', 'Task']);
const set = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Agent launches made by the coordinator: the main thread, plus (legacy traces) any stream launched by a delegated
 * ai-flow:orchestrator, at any depth. Launches from inside other phase agents are not coordinator routing.
 */
function coordinatorCalls(lines) {
  const r = roles();
  const delegated = new Set();
  const out = [];
  for (const o of lines) {
    if (o.type !== 'assistant') continue;
    const parent = o.parent_tool_use_id;
    if (parent && !delegated.has(parent)) continue;
    for (const c of o.message?.content ?? []) {
      if (c.type !== 'tool_use') continue;
      if (AGENT_TOOLS.has(c.name) && r.shortName(c.input?.subagent_type) === 'orchestrator') delegated.add(c.id);
      out.push(c);
    }
  }
  return out;
}

function coordinatorLaunches(lines) {
  return coordinatorCalls(lines)
    .filter((c) => AGENT_TOOLS.has(c.name))
    .map((c) => ({ id: c.id, agent: c.input?.subagent_type ?? '', input: c.input ?? {} }));
}

/** Only the user-facing phase skills (ai-flow:flow-*) count; coordinator skills (using-ai-flow, coordinating-*) do not. */
const isPhaseSkill = (name) => typeof name === 'string' && name.startsWith('ai-flow:flow-');

/** orchestrator_delegation: Agent launches of ai-flow:orchestrator anywhere in the trace, at any depth. */
function orchestratorDelegation(lines) {
  const r = roles();
  let n = 0;
  for (const o of lines) {
    if (o.type !== 'assistant') continue;
    for (const c of o.message?.content ?? []) {
      if (c.type === 'tool_use' && AGENT_TOOLS.has(c.name) && r.shortName(c.input?.subagent_type) === 'orchestrator') n++;
    }
  }
  return n;
}

/** main_phase_skill_loads: Skill calls to ai-flow:flow-* made by the coordinator stream. */
function mainPhaseSkillLoads(lines) {
  return coordinatorCalls(lines).filter((c) => c.name === 'Skill' && isPhaseSkill(c.input?.skill)).length;
}

/**
 * routing_coverage: share of coordinator launches of ai-flow:* agents that carry both model and effort. null when
 * there are no such launches (nothing to measure). `unrouted` lists the launches missing either field.
 */
export function gradeRouting(lines) {
  const launches = coordinatorLaunches(lines).filter((l) => l.agent.startsWith('ai-flow:'));
  const extra = { orchestrator_delegation: orchestratorDelegation(lines), main_phase_skill_loads: mainPhaseSkillLoads(lines) };
  if (!launches.length) return { routing_coverage: null, launches: 0, unrouted: [], ...extra };
  const unrouted = launches.filter((l) => !(set(l.input.model) && set(l.input.effort))).map((l) => ({ id: l.id, agent: l.agent }));
  return { routing_coverage: (launches.length - unrouted.length) / launches.length, launches: launches.length, unrouted, ...extra };
}
