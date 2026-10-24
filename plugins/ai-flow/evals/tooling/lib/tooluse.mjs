// Tool-use graders (REQ-010). Recorded metrics, never gates for the v3.4.0 baseline:
//  - subagent_ask: AskUserQuestion ATTEMPTS from any subagent (a call rejected as an unknown tool still counts);
//  - readonly_writes: Write/Edit/NotebookEdit/MultiEdit by read-only agents or the verifier (MCP writes never count);
//  - unknown_attribution: calls whose sidechain cannot be mapped to an agent type (reported, not dropped).
import { roles } from './config.mjs';
import { relPath } from './tdd.mjs';

const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };

/**
 * Self-delegation (B2b D6, REQ-007): launches whose agent type equals the launching agent's type, at any depth
 * (main is never a launcher). From the merged agent tree. Returns { count, launches: [{ agent, depth, launched_by }] }.
 */
export function selfDelegation(tree, cfg) {
  const r = roles(cfg);
  const byId = new Map(tree.map((t) => [t.tool_use_id, t]));
  const launches = [];
  for (const t of tree) {
    const parent = byId.get(t.launched_by);
    if (parent && r.shortName(parent.agent) === r.shortName(t.agent)) launches.push({ agent: r.shortName(t.agent), depth: t.depth, launched_by: r.shortName(parent.agent) });
  }
  return { count: launches.length, launches };
}

export function gradeToolUse(calls, cfg, { cwd, tree } = {}) {
  const r = roles(cfg);
  const ask = { total: 0, by_agent: {} };
  const writes = { total: 0, by_agent: {}, calls: [] };
  let unknown = 0;
  for (const c of calls) {
    if (c.agent === 'unknown') unknown++;
    const agent = c.agent === 'unknown' ? 'unknown' : r.shortName(c.agent);
    if (c.name === 'AskUserQuestion' && c.agent !== 'main') { ask.total++; bump(ask.by_agent, agent); }
    if (r.isWriteTool(c.name) && c.agent !== 'main' && r.isNoWrite(c.agent)) {
      writes.total++;
      bump(writes.by_agent, agent);
      writes.calls.push({ agent, tool: c.name, path: relPath(c.input.file_path ?? c.input.notebook_path, cwd) });
    }
  }
  return { subagent_ask: ask, readonly_writes: writes, unknown_attribution: unknown, ...(tree ? { self_delegation: selfDelegation(tree, cfg) } : {}) };
}
