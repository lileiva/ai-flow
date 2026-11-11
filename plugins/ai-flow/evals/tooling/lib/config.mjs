// Loads evals/tooling/config.json (or AIFLOW_EVAL_CONFIG when set) and exposes agent-role helpers (design D13).
import fs from 'node:fs';
import path from 'node:path';
import { TOOLING_DIR } from './paths.mjs';

export function configPath(env = process.env) {
  return env.AIFLOW_EVAL_CONFIG || path.join(TOOLING_DIR, 'config.json');
}

export function loadConfig(env = process.env) {
  return JSON.parse(fs.readFileSync(configPath(env), 'utf8'));
}

/** Role questions over a subagent_type such as "ai-flow:planner" (the plugin prefix is optional). */
export function roles(cfg = loadConfig()) {
  const readOnly = new Set(cfg.readOnlyAgents);
  const noWrite = new Set(cfg.noWriteAgents);
  const writeTools = new Set(cfg.writeTools);
  const shortName = (type) => String(type ?? '').split(':').at(-1);
  return {
    shortName,
    isReadOnly: (type) => readOnly.has(shortName(type)),
    isNoWrite: (type) => noWrite.has(shortName(type)),
    phaseOf: (type) => cfg.phaseMap[shortName(type)] ?? null,
    isWriteTool: (name) => writeTools.has(name),
  };
}
