// Phase order and gate adherence (REQ-008, REQ-004 S1). Reads main-thread events only: Agent launches (with
// the phase from config.phaseMap) and gate markers printed by the orchestrator under the unattended policy
// (`AUTO-APPROVED GATE: <gate>` / `STOPPED AT GATE: <gate>`), in trace order.
import { roles } from './config.mjs';
import { isImplFile, isTestFile, relPath } from './tdd.mjs';

const GATE_RE = /(?:AUTO-APPROVED GATE|STOPPED AT GATE):\s*([a-z]+)/g;
const PRE_PHASES = ['explore', 'propose', 'spec', 'design', 'plan'];

/**
 * Ordered main-thread events: { kind: 'launch', agent, phase, order } | { kind: 'gate', gate, order } | { kind: 'write', file, order }.
 * Delegated orchestration (D2, generalized by B2b D5): an orchestrator launched by the main thread, or by an
 * orchestrator that is itself delegated (self-delegation at any depth), runs the flow; its launches, gates and writes
 * count as main-thread events. Launches by phase agents (e.g. implementer -> debugger) are not main events.
 * A gate marker already recorded from another stream is an echo (e.g. the main thread repeating the orchestrator's
 * gates in its final summary) and counts once (B2b TG1); a repeat within the same stream is kept.
 * events.delegated_to names the delegate ('orchestrator') or is null.
 */
export function mainEvents(lines, cfg, cwd) {
  const r = roles(cfg);
  const events = [];
  const delegated = new Set();
  const gateStreams = new Map();
  let order = 0;
  for (const o of lines) {
    const stream = o.parent_tool_use_id ?? 'main';
    if (o.type !== 'assistant' || (o.parent_tool_use_id && !delegated.has(o.parent_tool_use_id))) continue;
    for (const c of o.message?.content ?? []) {
      if (c.type === 'tool_use' && (c.name === 'Agent' || c.name === 'Task')) {
        if (r.shortName(c.input?.subagent_type ?? '') === 'orchestrator') delegated.add(c.id);
        events.push({ kind: 'launch', agent: r.shortName(c.input?.subagent_type ?? 'general-purpose'), phase: r.phaseOf(c.input?.subagent_type), order: order++ });
      } else if (c.type === 'tool_use' && r.isWriteTool(c.name)) {
        events.push({ kind: 'write', file: relPath(c.input?.file_path ?? c.input?.notebook_path, cwd), order: order++ });
      } else if (c.type === 'text') {
        for (const m of c.text.matchAll(GATE_RE)) {
          const seen = gateStreams.get(m[1]);
          if (seen && !seen.has(stream)) continue;
          if (!seen) gateStreams.set(m[1], new Set([stream]));
          events.push({ kind: 'gate', gate: m[1], order: order++ });
        }
      }
    }
  }
  events.delegated_to = delegated.size ? 'orchestrator' : null;
  return events;
}

/**
 * Grade phases. mode: 'e2e' (DAG order + gates), 'apply-only' (case d), 'propose-plan' (case e: order + proposal gate).
 * Returns { launched, gates, order_ok, order_violations, main_thread_phase_work, apply_only_ok? }.
 */
export function gradePhases(lines, cfg, { cwd, mode = 'e2e' } = {}) {
  const ev = mainEvents(lines, cfg, cwd);
  const launched = ev.filter((e) => e.kind === 'launch').map(({ agent, phase, order }) => ({ agent, phase, order }));
  const gates = ev.filter((e) => e.kind === 'gate').map(({ gate, order }) => ({ gate, order }));
  const first = (phase) => launched.find((l) => l.phase === phase)?.order;
  const violations = [];

  if (mode !== 'apply-only') {
    for (const [a, b] of cfg.dagEdges) {
      if (a === 'explore') continue; // exploration may be seeded (case e) or folded into propose
      const fb = first(b);
      if (fb === undefined) continue;
      const fa = first(a);
      if (fa === undefined || fa > fb) violations.push(`${b} before ${a}`);
    }
    const gateBetween = (gate, after, before) => {
      if (before === undefined) return;
      const ok = gates.some((g) => g.gate === gate && (after === undefined || g.order > after) && g.order < before);
      if (!ok) violations.push(`missing gate: ${gate}`);
    };
    const firstSpecDesign = Math.min(first('spec') ?? Infinity, first('design') ?? Infinity);
    gateBetween('proposal', first('propose'), Number.isFinite(firstSpecDesign) ? firstSpecDesign : undefined);
    if (mode === 'e2e') {
      gateBetween('plan', first('plan'), first('apply'));
      const applies = launched.filter((l) => l.phase === 'apply');
      if (applies.length) gateBetween('tracer', applies[0].order, applies[1]?.order ?? first('verify'));
      gateBetween('verify', first('verify'), first('archive'));
    }
  }

  const work = ev.filter((e) => e.kind === 'write' && e.file && (isImplFile(e.file) || isTestFile(e.file))).map((e) => e.file);
  if (work.length) violations.push('orchestrator performed phase work');

  const result = { launched, gates, order_ok: false, order_violations: [...new Set(violations)], main_thread_phase_work: work, delegated_to: ev.delegated_to };
  if (mode === 'apply-only') {
    const pre = launched.filter((l) => PRE_PHASES.includes(l.phase));
    for (const l of pre) result.order_violations.push(`apply-only case launched ${l.agent}`);
    result.apply_only_ok = pre.length === 0 && launched.some((l) => l.phase === 'apply');
  }
  result.order_ok = result.order_violations.length === 0;
  return result;
}

/** Grading mode for a case name: a-c e2e, d apply-only, e propose-plan. */
export function phaseMode(caseName) {
  const id = String(caseName ?? '').split('-')[0];
  return id === 'd' ? 'apply-only' : id === 'e' ? 'propose-plan' : 'e2e';
}
