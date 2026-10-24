// Parses a `claude plugin eval` trace.jsonl (design F6).

export function parseTrace(text) {
  const lines = [];
  let parseErrors = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try { lines.push(JSON.parse(raw)); } catch { parseErrors++; }
  }
  return { lines, parseErrors };
}

/** Sum usage once per assistant message.id (usage is repeated on every content block). `filter` selects lines. */
export function tokenTotals(lines, filter = () => true) {
  const seen = new Set();
  const t = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  for (const o of lines) {
    if (o.type !== 'assistant' || !o.message?.usage || !filter(o)) continue;
    const id = o.message.id;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const u = o.message.usage;
    t.input += u.input_tokens ?? 0;
    t.output += u.output_tokens ?? 0;
    t.cache_read += u.cache_read_input_tokens ?? 0;
    t.cache_creation += u.cache_creation_input_tokens ?? 0;
  }
  return { ...t, total: t.input + t.output + t.cache_read + t.cache_creation, source: 'trace' };
}

/** Sum of result.modelUsage over models from the LAST result line, or null when absent. */
export function modelUsageTotals(lines) {
  const res = lines.filter((o) => o.type === 'result' && o.modelUsage && Object.keys(o.modelUsage).length).at(-1);
  if (!res) return null;
  const t = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  for (const u of Object.values(res.modelUsage)) {
    t.input += u.inputTokens ?? 0;
    t.output += u.outputTokens ?? 0;
    t.cache_read += u.cacheReadInputTokens ?? 0;
    t.cache_creation += u.cacheCreationInputTokens ?? 0;
  }
  return { ...t, total: t.input + t.output + t.cache_read + t.cache_creation };
}

/**
 * Run token totals. result.modelUsage is authoritative (real traces carry message_start usage snapshots and
 * omit some background-subagent messages); the deduped per-message trace sum is kept as trace_total with
 * trace_coverage = trace_total / total.
 */
export function runTokens(lines, { unreliable = false } = {}) {
  const trace = tokenTotals(lines);
  const mu = modelUsageTotals(lines);
  if (!mu && unreliable) return { total: null, source: 'unavailable', trace_total: trace.total, trace_coverage: null };
  if (!mu) return { ...trace, trace_total: trace.total, trace_coverage: 1 };
  return { ...mu, source: 'result.modelUsage', trace_total: trace.total, trace_coverage: mu.total ? Math.round((trace.total / mu.total) * 1000) / 1000 : null };
}

const AGENT_TOOLS = new Set(['Agent', 'Task']);

/** Map Agent tool_use id -> subagent_type, from Agent tool_use inputs and system/task_started lines. */
export function attributionIndex(lines) {
  const idx = new Map();
  for (const o of lines) {
    if (o.type === 'system' && o.subtype === 'task_started' && o.tool_use_id && o.subagent_type) idx.set(o.tool_use_id, o.subagent_type);
    if (o.type !== 'assistant') continue;
    for (const c of o.message?.content ?? []) {
      if (c.type === 'tool_use' && AGENT_TOOLS.has(c.name)) idx.set(c.id, c.input?.subagent_type ?? 'general-purpose');
    }
  }
  return idx;
}

/**
 * Agent launches whose sidechain never shows up in the trace (no line has them as parent_tool_use_id): nested
 * subagents launched from inside a subagent (claude 2.1.302 keeps only their task_* events). Their tool calls,
 * writes and engram payloads are invisible to the graders.
 */
export function unobservedSubagents(lines) {
  const parents = new Set(lines.map((o) => o.parent_tool_use_id).filter(Boolean));
  // Only launches that actually started (task_started); a rejected launch (e.g. unknown agent type) did no work.
  const started = new Set(lines.filter((o) => o.type === 'system' && o.subtype === 'task_started').map((o) => o.tool_use_id));
  const out = [];
  for (const o of lines) {
    if (o.type !== 'assistant') continue;
    for (const c of o.message?.content ?? []) {
      if (c.type === 'tool_use' && AGENT_TOOLS.has(c.name) && started.has(c.id) && !parents.has(c.id)) out.push({ id: c.id, agent: c.input?.subagent_type ?? 'general-purpose', launched_by: o.parent_tool_use_id ?? 'main' });
    }
  }
  return out;
}

/**
 * Agent type that produced a line: 'main' for the main thread, else the type of its launch. A merged transcript line
 * whose launch is unknown (an orphan, B2b R6) falls back to its meta.agentType (agent_type); otherwise 'unknown'.
 */
export function agentOf(line, idx) {
  const p = line.parent_tool_use_id;
  if (!p) return 'main';
  return idx.get(p) ?? line.agent_type ?? 'unknown';
}

/** Ordered tool calls with their results: [{ id, name, input, agent, instance, result }]. */
export function toolCalls(lines, idx = attributionIndex(lines)) {
  const calls = [];
  const byId = new Map();
  for (const o of lines) {
    for (const c of o.message?.content ?? []) {
      if (o.type === 'assistant' && c.type === 'tool_use') {
        const call = { id: c.id, name: c.name, input: c.input ?? {}, agent: agentOf(o, idx), instance: o.parent_tool_use_id ?? 'main', result: null };
        calls.push(call);
        byId.set(c.id, call);
      } else if (o.type === 'user' && c.type === 'tool_result' && byId.has(c.tool_use_id)) {
        const content = c.content;
        byId.get(c.tool_use_id).result = typeof content === 'string' ? content : (content ?? []).map((x) => x.text ?? '').join('');
      }
    }
  }
  return calls;
}

/** More than 1% of trace lines failed to parse (REQ-011 S3). */
export const PARSE_ERROR_LIMIT = 0.01;
export const traceUnreliable = (lineCount, parseErrors) => parseErrors > 0 && parseErrors / (lineCount + parseErrors) > PARSE_ERROR_LIMIT;

/**
 * Per-phase tokens (REQ-011 S2; user decision 2026-10-18). Per agent type, tokens_total is the sum of
 * system/task_notification usage.total_tokens over its instances; tokens_trace is the deduped per-message trace
 * sum for its sidechains (kept for reference, it undercounts). main.tokens_total is the deduped main-thread sum.
 * per_phase_coverage = (sum of tokens_total) / run total is informational only.
 * Returns { per_phase, per_phase_reason, per_phase_source, per_phase_coverage }.
 */
export function perPhase(lines, idx, runTotal, { unreliable = false } = {}) {
  const none = (reason) => ({ per_phase: null, per_phase_reason: reason, per_phase_source: null, per_phase_coverage: null });
  if (unreliable) return none(`more than ${PARSE_ERROR_LIMIT * 100}% of trace lines are unparseable`);
  const notes = lines.filter((o) => o.type === 'system' && o.subtype === 'task_notification' && o.usage);
  const hasSidechains = lines.some((o) => o.parent_tool_use_id);
  if (hasSidechains && notes.length === 0) return none('subagent sidechains present but no task_notification usage in the trace');
  const per = {};
  for (const n of notes) {
    const type = idx.get(n.tool_use_id) ?? 'unknown';
    const p = (per[type] ??= { instances: 0, tokens_total: 0, tokens_notification: 0, tokens_trace: 0, tool_uses: 0, duration_ms: 0 });
    p.instances += 1;
    p.tokens_total += n.usage.total_tokens ?? 0;
    p.tokens_notification += n.usage.total_tokens ?? 0;
    p.tool_uses += n.usage.tool_uses ?? 0;
    p.duration_ms += n.usage.duration_ms ?? 0;
    p.tokens_trace += tokenTotals(lines, (o) => o.parent_tool_use_id === n.tool_use_id).total;
  }
  per.main = { tokens_total: tokenTotals(lines, (o) => !o.parent_tool_use_id).total };
  const sum = Object.values(per).reduce((s, p) => s + p.tokens_total, 0);
  const coverage = runTotal ? Math.round((sum / runTotal) * 1000) / 1000 : null;
  return { per_phase: per, per_phase_reason: null, per_phase_source: 'task_notification', per_phase_coverage: coverage };
}

/**
 * Informational tokens per agent type summed from the (merged) lines of its instances, deduped per message id
 * (B2b TG2). Unlike per_phase (task_notification usage), this counts every transcript message, cache included.
 * tree: the merged agent tree [{ tool_use_id, agent }]. Returns { <type>: tokens, main: tokens }.
 */
export function agentTranscriptTokens(lines, tree) {
  const byType = new Map();
  for (const t of tree) byType.set(t.agent, [...(byType.get(t.agent) ?? []), t.tool_use_id]);
  const out = {};
  for (const [type, ids] of [...byType].sort()) {
    const set = new Set(ids);
    out[type] = tokenTotals(lines, (o) => set.has(o.parent_tool_use_id)).total;
  }
  out.main = tokenTotals(lines, (o) => !o.parent_tool_use_id).total;
  return out;
}
