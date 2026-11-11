import fs from 'node:fs';

// As-shipped SessionStart cost and clean-environment checks from a run trace (REQ-012, REQ-013 S4, REQ-005 S1, REQ-006 S3).

/** SessionStart hook outcome. injected_tokens_est = 0 when the hook errors, else ceil(stdout chars / 4). */
export function sessionStart(lines) {
  const h = lines.find((o) => o.type === 'system' && o.subtype === 'hook_response' && o.hook_event === 'SessionStart');
  if (!h) return { hook_outcome: null, exit_code: null, stdout_chars: 0, injected_tokens_est: 0 };
  const chars = (h.stdout ?? '').length;
  return { hook_outcome: h.outcome ?? null, exit_code: h.exit_code ?? null, stdout_chars: chars, injected_tokens_est: h.outcome === 'error' ? 0 : Math.ceil(chars / 4) };
}

/**
 * Environment of the run: model, plugins (ai-flow first), MCP servers, and the clean-config checks.
 * plugins_clean: every plugin other than the one under test is a builtin. mcp_mock_only: every MCP server is a
 * dynamic (mock) server. contamination: a line from `sentinels` (e.g. distinctive lines of the user's
 * ~/.claude/CLAUDE.md) appears anywhere in the trace. acceptance_peek: the agent read a hidden acceptance file.
 */
export function runEnv(lines, rawText, calls, { sentinels = [], pluginName = 'ai-flow' } = {}) {
  const init = lines.find((o) => o.type === 'system' && o.subtype === 'init') ?? {};
  const plugins = init.plugins ?? [];
  const servers = init.mcp_servers ?? [];
  const hits = sentinels.map((s) => s.trim()).filter((s) => s && rawText.includes(s));
  const peek = calls.some((c) => (c.name === 'Read' && /\.accept\.test\.[cm]?js$/.test(c.input.file_path ?? '')) || (c.name === 'Bash' && /\.accept\.test\./.test(c.input.command ?? '')));
  return {
    model: init.model ?? null,
    plugins: [...plugins.filter((p) => p.name === pluginName), ...plugins.filter((p) => p.name !== pluginName)].map((p) => p.name),
    plugins_clean: plugins.some((p) => p.name === pluginName) && plugins.every((p) => p.name === pluginName || p.path === 'builtin'),
    mcp_servers: servers.map((s) => s.name),
    mcp_mock_only: servers.every((s) => s.source === 'dynamic'),
    contamination: hits.length > 0,
    contamination_hits: hits,
    acceptance_peek: peek,
  };
}

/** Sentinel lines from the file named by AIFLOW_EVAL_SENTINELS (one per line; blank lines ignored). */
export function loadSentinels(file) {
  if (!file) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
}
