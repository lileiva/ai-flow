#!/usr/bin/env node
// Trim a real eval trace into a small offline fixture (REQ-019 S2). Keeps every field the analyzer reads:
// line type/subtype, message.id, usage, parent_tool_use_id, tool_use id/name and the inputs that matter
// (file_path, command, subagent_type), tool_result ids with the first 2 KB of content, task/hook system
// lines and the final result. Long prompts and texts are shortened, thinking is blanked, $HOME is
// replaced by /HOME and other local paths are scrubbed (lib/scrub.mjs).
// Usage: node scripts/trim-trace.mjs <in.jsonl> <out.jsonl> [--home /home/me]
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { scrubLocalPaths } from '../lib/scrub.mjs';

const RESULT_MAX = 2048;
const TEXT_MAX = 2048;
const PROMPT_MAX = 300;
// Subagent transcripts (B2b E4): attachment lines carry the host email (session_context); api-request* are noise.
const DROP_TYPES = new Set(['rate_limit_event', 'stream_event', 'attachment', 'api-request', 'api-request-shape', 'api-request-blob']);
const DROP_SUBTYPES = new Set(['thinking_tokens']);
const KEEP_INPUT = ['file_path', 'notebook_path', 'command', 'description', 'subagent_type', 'pattern', 'path', 'skill', 'query', 'id', 'title', 'topic_key', 'project', 'type', 'old_string', 'new_string', 'content', 'prompt'];
const INPUT_MAX = { prompt: PROMPT_MAX, content: TEXT_MAX, old_string: 500, new_string: 500 };
// Engram artifact text is graded for required sections (REQ-009), so keep far more of it.
const ENGRAM_CONTENT_MAX = 16384;
const isEngramWrite = (name) => /__mem_(save|update)$/.test(name ?? '');
const INIT_KEYS = ['type', 'subtype', 'cwd', 'model', 'tools', 'mcp_servers', 'plugins', 'agents', 'claude_code_version', 'memory_paths', 'permissionMode'];
const RESULT_KEYS = ['type', 'subtype', 'is_error', 'total_cost_usd', 'duration_ms', 'num_turns', 'usage', 'modelUsage', 'subagent_stats', 'terminal_reason', 'stop_reason', 'api_error_status'];

const cut = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n) : s);

// Run markers (unattended policy) are graded from text, so markers past the cut are re-appended, one per line.
const MARKER_RE = /(?:AUTO-APPROVED GATE|STOPPED AT GATE):\s*[a-z]+|EVAL-RUN-COMPLETE/g;
function cutText(s, n) {
  if (typeof s !== 'string' || s.length <= n) return s;
  const markers = s.slice(n).match(MARKER_RE) ?? [];
  return s.slice(0, n) + (markers.length ? `\n[...]\n${markers.join('\n')}` : '');
}

function pick(obj, keys) {
  const o = {};
  for (const k of keys) if (obj[k] !== undefined) o[k] = obj[k];
  return o;
}

function trimBlock(b) {
  if (b.type === 'thinking') return { type: 'thinking', thinking: '' };
  if (b.type === 'redacted_thinking') return { type: 'redacted_thinking' };
  if (b.type === 'text') return { type: 'text', text: cutText(b.text, TEXT_MAX) };
  if (b.type === 'tool_use') {
    const input = {};
    // MCP inputs are kept whole (strings cut): mock calls are reconciled by canonical input (B2b W5, D7).
    const keys = b.name?.startsWith('mcp__') ? Object.keys(b.input ?? {}) : KEEP_INPUT;
    for (const k of keys) {
      if (b.input?.[k] === undefined) continue;
      const max = k === 'content' && isEngramWrite(b.name) ? ENGRAM_CONTENT_MAX : INPUT_MAX[k] ?? (b.name?.startsWith('mcp__') ? TEXT_MAX : undefined);
      input[k] = max ? cut(b.input[k], max) : b.input[k];
    }
    return { type: 'tool_use', id: b.id, name: b.name, input };
  }
  if (b.type === 'tool_result') {
    const content = typeof b.content === 'string' ? b.content : (b.content ?? []).map((x) => x.text ?? '').join('');
    return { type: 'tool_result', tool_use_id: b.tool_use_id, content: cut(content, RESULT_MAX), ...(b.is_error ? { is_error: true } : {}) };
  }
  return { type: b.type };
}

function trimLine(o) {
  if (DROP_TYPES.has(o.type) || DROP_SUBTYPES.has(o.subtype)) return null;
  if (o.type === 'system' && o.subtype === 'init') {
    const init = pick(o, INIT_KEYS);
    if (Array.isArray(init.plugins)) init.plugins = init.plugins.map((p) => pick(p, ['name', 'path', 'source', 'version']));
    return init;
  }
  if (o.type === 'result') return pick(o, RESULT_KEYS);
  if (o.type === 'assistant' || o.type === 'user') {
    const m = o.message ?? {};
    const content = Array.isArray(m.content) ? m.content.map(trimBlock) : cut(m.content, TEXT_MAX);
    const message = { ...(m.id ? { id: m.id } : {}), role: m.role, ...(m.model ? { model: m.model } : {}), content, ...(m.usage ? { usage: m.usage } : {}) };
    return { type: o.type, parent_tool_use_id: o.parent_tool_use_id ?? null, ...(o.isSidechain !== undefined ? { isSidechain: o.isSidechain } : {}), ...(o.agentId ? { agentId: o.agentId } : {}), message };
  }
  if (o.type === 'system') {
    const s = { ...o };
    delete s.uuid;
    delete s.session_id;
    for (const k of ['stdout', 'stderr', 'output', 'prompt', 'description', 'summary']) if (typeof s[k] === 'string') s[k] = cut(s[k], RESULT_MAX);
    return s;
  }
  return pick(o, ['type', 'subtype']);
}

export function trimTrace(text, { home = os.homedir() } = {}) {
  const out = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    let o;
    try { o = JSON.parse(raw); } catch { continue; }
    const t = trimLine(o);
    if (t) out.push(scrubLocalPaths(JSON.stringify(t).split(home).join('/HOME')));
  }
  return out.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  const hi = process.argv.indexOf('--home');
  const home = hi > 0 ? process.argv[hi + 1] : os.homedir();
  const trimmed = trimTrace(fs.readFileSync(input, 'utf8'), { home });
  fs.writeFileSync(output, trimmed);
  console.log(`${output}: ${trimmed.length} bytes (from ${fs.statSync(input).size})`);
}
