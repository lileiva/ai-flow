// Nested subagent capture (B2b design D1-D4). The CLI writes one transcript per subagent at any depth
// (<kept>/config/projects/<slug>/<session>/subagents/agent-<id>.jsonl + .meta.json); the run bundle keeps a
// filtered copy under results/<ts>/traces/<case>-<i>/. These helpers load it and merge it into the trace.
import fs from 'node:fs';
import path from 'node:path';
import { parseTrace } from './trace.mjs';
import { scrubEmails, scrubLocalPaths } from './scrub.mjs';

/**
 * Read subagents/agent-<id>.{jsonl,meta.json} and mock-calls.jsonl from a directory holding them. A transcript with
 * no parseable line is not loaded (it counts as missing) and its parse error is recorded. `location` is the scrubbed
 * transcript dir and `dir_missing` says it does not exist (capture failed "no subagent transcripts found at ...").
 */
function readAgents(subDir, mockFile, location = subDir) {
  const agents = [];
  const errors = [];
  const dirMissing = !fs.existsSync(subDir);
  const files = dirMissing ? [] : fs.readdirSync(subDir).filter((f) => /^agent-.+\.meta\.json$/.test(f)).sort();
  for (const f of files) {
    const id = f.slice('agent-'.length, -'.meta.json'.length);
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(subDir, f), 'utf8'));
      const { lines, parseErrors } = parseTrace(fs.readFileSync(path.join(subDir, `agent-${id}.jsonl`), 'utf8'));
      if (parseErrors) errors.push(`parse error: agent-${id}.jsonl: ${parseErrors} unparseable line(s)`);
      if (lines.length === 0 && parseErrors) continue;
      agents.push({ id, meta, lines: lines.filter((l) => l.type === 'user' || l.type === 'assistant') });
    } catch (e) {
      errors.push(`${e instanceof SyntaxError ? 'parse error' : 'read error'}: agent-${id}: ${e.code ?? e.message}`);
    }
  }
  const mockCalls = fs.existsSync(mockFile) ? parseTrace(fs.readFileSync(mockFile, 'utf8')).lines.filter((l) => l.server && l.tool) : [];
  return { agents, mockCalls, mock_calls_file: fs.existsSync(mockFile), errors, location: scrubLocalPaths(location), dir_missing: dirMissing };
}

/** Subagent transcript dir of a kept run: <kept>/config/projects/<slug>/<sessionId>/subagents (design D1, E2). */
export function keptSubagentsDir(keptDir, sessionId) {
  const projects = path.join(keptDir, 'config', 'projects');
  if (!fs.existsSync(projects)) return null;
  for (const slug of fs.readdirSync(projects)) {
    const sessions = sessionId ? [sessionId] : fs.readdirSync(path.join(projects, slug));
    for (const s of sessions) {
      const dir = path.join(projects, slug, s, 'subagents');
      if (fs.existsSync(dir)) return dir;
    }
  }
  return null;
}

/** Transcripts of a kept run dir, as written by the CLI. */
export function loadKept(keptDir, sessionId) {
  const sub = keptSubagentsDir(keptDir, sessionId);
  const location = sub ?? path.join(keptDir, 'config', 'projects', '*', sessionId ?? '*', 'subagents');
  return { ...readAgents(sub ?? location, path.join(keptDir, 'out', 'mock-calls.jsonl'), location), source: 'kept' };
}

/**
 * Copy a kept run's nested capture into destDir (design D2): trace.jsonl, subagents/agent-<id>.jsonl with only
 * user/assistant lines (E4: attachment and api-request* lines carry ~90% of the bytes and the host email),
 * agent-<id>.meta.json and mock-calls.jsonl. Every file is scrubbed of local paths and emails.
 */
export function retainBundle(keptDir, sessionId, destDir, { tracePath } = {}) {
  const scrub = (t) => scrubEmails(scrubLocalPaths(t));
  const files = [];
  const write = (rel, text) => {
    const p = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, scrub(text));
    files.push(rel);
  };
  fs.rmSync(destDir, { recursive: true, force: true });
  if (tracePath && fs.existsSync(tracePath)) write('trace.jsonl', fs.readFileSync(tracePath, 'utf8'));
  const mock = path.join(keptDir, 'out', 'mock-calls.jsonl');
  if (fs.existsSync(mock)) write('mock-calls.jsonl', fs.readFileSync(mock, 'utf8'));
  const sub = keptSubagentsDir(keptDir, sessionId);
  for (const f of sub ? fs.readdirSync(sub).sort() : []) {
    const text = fs.readFileSync(path.join(sub, f), 'utf8');
    if (f.endsWith('.meta.json')) write(`subagents/${f}`, text);
    else if (f.endsWith('.jsonl')) write(`subagents/${f}`, text.split('\n').filter(keepTranscriptLine).join('\n') + '\n');
  }
  return { files, bytes: files.reduce((n, f) => n + fs.statSync(path.join(destDir, f)).size, 0) };
}

/** Transcript lines worth keeping: user and assistant messages (unparseable lines are dropped). */
export function keepTranscriptLine(raw) {
  try { return ['user', 'assistant'].includes(JSON.parse(raw).type); } catch { return false; }
}

/** A retained run bundle (results/<ts>/traces/<case>-<i>/). */
export function loadBundle(dir) {
  return { ...readAgents(path.join(dir, 'subagents'), path.join(dir, 'mock-calls.jsonl')), source: 'bundle' };
}

/** Capture cause of a trace kept before B2b (no transcripts retained), e.g. a regraded legacy flat trace. */
export const LEGACY_REASON = 'nested transcripts not retained (pre-B2b trace)';

const AGENT_TOOLS = new Set(['Agent', 'Task']);
const blocks = (l) => (Array.isArray(l.message?.content) ? l.message.content : []);
// Lines spliced in from a transcript carry nested_source 'transcript' (real trace sidechain lines also carry agent_id).
const fromTranscript = (l) => l.nested_source === 'transcript';
const toolUseIdsOf = (l) => (l.type === 'assistant' ? blocks(l).filter((c) => c.type === 'tool_use').map((c) => c.id) : []);

/** Index of the line holding the tool_result for toolUseId, else the launching tool_use line + 1, else the end. */
export function spliceIndex(lines, toolUseId) {
  const res = lines.findIndex((l) => l.type === 'user' && blocks(l).some((c) => c.type === 'tool_result' && c.tool_use_id === toolUseId));
  if (res >= 0) return res;
  const use = lines.findIndex((l) => toolUseIdsOf(l).includes(toolUseId));
  return use >= 0 ? use + 1 : lines.length;
}

/** Launches that started: task_started (local_agent) ids at any depth, plus Agent/Task tool_uses with a result or task_* event. */
function expectedLaunches(lines) {
  const started = new Map();
  for (const o of lines) {
    if (o.type === 'system' && o.subtype === 'task_started' && o.tool_use_id && (o.task_type ?? 'local_agent') === 'local_agent') started.set(o.tool_use_id, o);
  }
  const launchOfTask = new Map([...started.values()].filter((o) => o.task_id).map((o) => [o.task_id, o.tool_use_id]));
  const taskIds = new Set(lines.filter((o) => o.type === 'system' && /^task_/.test(o.subtype ?? '') && o.tool_use_id).map((o) => o.tool_use_id));
  const resultIds = new Set(lines.flatMap((l) => (l.type === 'user' ? blocks(l).filter((c) => c.type === 'tool_result').map((c) => c.tool_use_id) : [])));
  const out = new Map();
  for (const l of lines) {
    for (const c of l.type === 'assistant' ? blocks(l) : []) {
      if (c.type !== 'tool_use' || !AGENT_TOOLS.has(c.name)) continue;
      if (!started.has(c.id) && !taskIds.has(c.id) && !resultIds.has(c.id)) continue;
      out.set(c.id, { tool_use_id: c.id, agent: c.input?.subagent_type ?? started.get(c.id)?.subagent_type ?? 'general-purpose', launched_by: l.parent_tool_use_id ?? 'main', depth: started.get(c.id)?.spawn_depth ?? null });
    }
  }
  // Launches seen only through task_started (their launcher's transcript is missing): launcher from parent_task_id.
  for (const [id, o] of started) {
    if (out.has(id)) continue;
    const launchedBy = o.parent_task_id ? launchOfTask.get(o.parent_task_id) ?? null : o.spawn_depth === 1 ? 'main' : null;
    out.set(id, { tool_use_id: id, agent: o.subagent_type ?? 'general-purpose', launched_by: launchedBy, depth: o.spawn_depth ?? null });
  }
  return out;
}

const shortName = (t) => String(t ?? '').split(':').at(-1);

/**
 * Cause of a partial or failed capture, without the "capture failed:" / "capture partial:" prefix that applyCapture
 * adds (design D4). null for complete and not_applicable.
 */
export function captureReason(status, { bundle, missing }) {
  if (status === 'partial') return `missing ${[...new Set(missing.map((m) => shortName(m.agent)))].join(', ')}`;
  if (status !== 'failed') return null;
  if (bundle?.source === 'none') return bundle.reason;
  const parse = (bundle?.errors ?? []).filter((e) => e.startsWith('parse error'));
  if (!bundle?.dir_missing && parse.length) return parse.join('; ');
  return `no subagent transcripts found at ${bundle?.location ?? 'unknown location'}`;
}

/**
 * One trace-shaped stream (design D3): each agent transcript is tagged (parent_tool_use_id = meta.toolUseId,
 * agent_depth, agent_id, agent_type) and spliced into its parent stream just before the launching Agent
 * tool_result, depth-ascending. The instance's trace sidechain lines are replaced by the transcript (E5 superset);
 * trace-only lines are kept after it once and recorded in capture.inconsistent.
 * Capture (design D4): expected = launches that started; a launch is captured by its transcript (or, at depth 1,
 * by trace sidechain lines). not_applicable: no launch; complete: none missing; failed: no transcript captured
 * (or none retained: a pre-B2b bundle); partial otherwise. Orphans (R6): transcripts whose meta.toolUseId matches no
 * launch are appended to the end, attributed via meta.agentType, flagged orphan:true and listed; they never change
 * the status. Returns { lines, tree, capture }.
 */
export function mergeNested(traceLines, bundle) {
  let lines = [...traceLines];
  const inconsistent = [];
  const agents = [...(bundle?.agents ?? [])].sort((a, b) => (a.meta.spawnDepth ?? 0) - (b.meta.spawnDepth ?? 0));
  const byLaunch = new Map();
  const deferred = [];
  for (const a of agents) {
    const launch = a.meta.toolUseId;
    const tagged = a.lines.map((l) => ({ ...l, parent_tool_use_id: launch, agent_depth: a.meta.spawnDepth, agent_id: a.id, agent_type: a.meta.agentType, nested_source: 'transcript' }));
    const launchedHere = lines.some((l) => toolUseIdsOf(l).includes(launch)) || lines.some((l) => l.type === 'system' && l.subtype === 'task_started' && l.tool_use_id === launch);
    if (!launchedHere) { deferred.push({ a, tagged }); continue; }
    byLaunch.set(launch, a);
    const own = new Set(tagged.flatMap(toolUseIdsOf));
    const sidechain = lines.filter((l) => (l.type === 'user' || l.type === 'assistant') && l.parent_tool_use_id === launch && !fromTranscript(l));
    const extra = sidechain.filter((l) => toolUseIdsOf(l).some((id) => !own.has(id)));
    if (extra.length) inconsistent.push({ tool_use_id: launch, agent_id: a.id, trace_only_lines: extra.length });
    const drop = new Set(sidechain);
    lines = lines.filter((l) => !drop.has(l));
    lines.splice(spliceIndex(lines, launch), 0, ...tagged.concat(extra));
  }
  const expected = expectedLaunches(lines);
  const orphans = [];
  for (const { a, tagged } of deferred) {
    if (expected.has(a.meta.toolUseId)) {
      // Its launch only appeared in a later (deeper-sorted) transcript: splice it now.
      byLaunch.set(a.meta.toolUseId, a);
      lines.splice(spliceIndex(lines, a.meta.toolUseId), 0, ...tagged);
      continue;
    }
    orphans.push({ agent_id: a.id, agent: a.meta.agentType, tool_use_id: a.meta.toolUseId, depth: a.meta.spawnDepth ?? null });
    lines.push(...tagged.map((l) => ({ ...l, orphan: true })));
  }
  const tree = [];
  const missing = [];
  for (const e of expected.values()) {
    const a = byLaunch.get(e.tool_use_id);
    const inTrace = !a && lines.some((l) => l.parent_tool_use_id === e.tool_use_id && !fromTranscript(l));
    const source = a ? 'transcript' : inTrace ? 'trace' : 'missing';
    const node = { tool_use_id: e.tool_use_id, ...(a ? { agent_id: a.id } : {}), agent: a?.meta.agentType ?? e.agent, depth: a?.meta.spawnDepth ?? e.depth, launched_by: e.launched_by, source };
    tree.push(node);
    if (source === 'missing') missing.push({ tool_use_id: node.tool_use_id, agent: node.agent, launched_by: node.launched_by, depth: node.depth });
  }
  const transcripts = tree.filter((t) => t.source === 'transcript').length;
  // A bundle that holds no transcripts at all (bundle.source 'none', e.g. a pre-B2b flat trace) cannot capture nesting.
  const status = tree.length === 0 ? 'not_applicable' : missing.length === 0 ? 'complete' : transcripts === 0 ? 'failed' : 'partial';
  const capture = { status, expected: tree.length, captured: tree.length - missing.length, transcripts, missing, orphans, inconsistent, reason: captureReason(status, { bundle, missing }) };
  return { lines, tree, capture };
}

/** JSON with object keys sorted at every level (mock calls carry no tool_use id: they are matched by input, E6). */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

const MCP_RE = /^mcp__(.+?)__(.+)$/;
const mcpCalls = (lines) => lines.flatMap((l) => (l.type === 'assistant' ? blocks(l) : []).filter((c) => c.type === 'tool_use' && MCP_RE.test(c.name ?? '')).map((c) => {
  const [, server, tool] = c.name.match(MCP_RE);
  return { id: c.id, server, tool, key: `${tool}\0${canonicalJson(c.input ?? {})}`, json: JSON.stringify(c.input ?? {}) };
}));

/**
 * Match key of a recorded mock call. The CLI records a large input (about 16 KB) as a truncated JSON string instead
 * of an object (alpha.2 gate, cases c-0/c-2): its first 16384 chars plus '…[truncated]'. Such a call matches by prefix
 * of the call's serialized input.
 */
const TRUNCATED = /…\[truncated\]$/;
function mockKey(m) {
  let v = m.input ?? {};
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return { tool: m.tool, prefix: v.replace(TRUNCATED, '') }; }
  }
  return { tool: m.tool, key: `${m.tool}\0${canonicalJson(v)}` };
}

/** Remove the first call in `pool` that matches mock key `mk`; true when one was found. */
function takeOne(pool, mk) {
  const i = pool.findIndex((c) => (mk.prefix != null ? c.tool === mk.tool && c.json.startsWith(mk.prefix) : c.key === mk.key));
  if (i < 0) return false;
  pool.splice(i, 1);
  return true;
}

/**
 * Mock-call accounting per MCP server (B2b D7, W5): which agent-answered mock calls the raw trace (depth <= 1) does
 * not show, and whether those are found in nested transcripts (lines merged from transcripts, minus calls the raw
 * trace already has). With mock-calls.jsonl: { mock_calls, unseen, found_in_transcripts, transcript_only }; without
 * it (mock_calls null): only transcript_only, for the count fallback.
 */
export function reconcileMocks(rawLines, mergedLines, { mockCalls = [], mockCallsFile = false } = {}) {
  const raw = mcpCalls(rawLines);
  const rawIds = new Set(raw.map((c) => c.id));
  const nested = mcpCalls(mergedLines.filter(fromTranscript)).filter((c) => !rawIds.has(c.id));
  const servers = new Set([...raw, ...nested].map((c) => c.server).concat(mockCalls.map((m) => m.server)));
  const out = {};
  for (const server of servers) {
    const pool = (calls) => calls.filter((c) => c.server === server);
    const transcriptOnly = nested.filter((c) => c.server === server).length;
    if (!mockCallsFile) { out[server] = { mock_calls: null, unseen: null, found_in_transcripts: null, transcript_only: transcriptOnly }; continue; }
    // Exact keys first, so a truncated (prefix) mock cannot take a call an exact mock needs.
    const mocks = mockCalls.filter((m) => m.server === server).map(mockKey).sort((a, b) => (a.prefix != null) - (b.prefix != null));
    const inTrace = pool(raw);
    const unseen = mocks.filter((mk) => !takeOne(inTrace, mk));
    const inTranscripts = pool(nested);
    out[server] = { mock_calls: mocks.length, unseen: unseen.length, found_in_transcripts: unseen.filter((mk) => takeOne(inTranscripts, mk)).length, transcript_only: transcriptOnly };
  }
  return out;
}
