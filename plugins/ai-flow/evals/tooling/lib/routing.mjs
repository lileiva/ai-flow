// Routing metrics (B4 REQ-013 S1 routing_coverage, REQ-003 S3). Informational: not in the D-2 blocking set (R6, R12).
import { roles } from './config.mjs';

const AGENT_TOOLS = new Set(['Agent', 'Task']);
const set = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Agent launches made by the coordinator: the main thread, plus (legacy traces) any stream launched by a delegated
 * ai-flow:orchestrator, at any depth. Launches from inside other phase agents are not coordinator routing.
 */
function coordinatorLaunches(lines) {
  const r = roles();
  const delegated = new Set();
  const out = [];
  for (const o of lines) {
    if (o.type !== 'assistant') continue;
    const parent = o.parent_tool_use_id;
    if (parent && !delegated.has(parent)) continue;
    for (const c of o.message?.content ?? []) {
      if (c.type !== 'tool_use' || !AGENT_TOOLS.has(c.name)) continue;
      const type = c.input?.subagent_type ?? '';
      if (r.shortName(type) === 'orchestrator') delegated.add(c.id);
      out.push({ id: c.id, agent: type, input: c.input ?? {} });
    }
  }
  return out;
}

/**
 * routing_coverage: share of coordinator launches of ai-flow:* agents that carry both model and effort. null when
 * there are no such launches (nothing to measure). `unrouted` lists the launches missing either field.
 */
export function gradeRouting(lines) {
  const launches = coordinatorLaunches(lines).filter((l) => l.agent.startsWith('ai-flow:'));
  if (!launches.length) return { routing_coverage: null, launches: 0, unrouted: [] };
  const unrouted = launches.filter((l) => !(set(l.input.model) && set(l.input.effort))).map((l) => ({ id: l.id, agent: l.agent }));
  return { routing_coverage: (launches.length - unrouted.length) / launches.length, launches: launches.length, unrouted };
}
