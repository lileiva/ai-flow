// Coercion lint (REQ-010, R4): flags pressure language in runtime prose. Fenced code blocks are exempt.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, applyAllowlist, listRuntimeMd } from './plugin-files.mjs';

// Banned phrases (case-insensitive) and all-caps tokens (case-sensitive): union of spec REQ-010 and design D-9.
const COERCION_PHRASES = ['Iron Law', 'No exceptions', 'Delete means delete', 'EXTREMELY_IMPORTANT', 'NON-NEGOTIABLE', 'Do NOT skip', 'or you will be', 'you will fail', 'violation of'];
const CAPS_TOKENS = ['MUST NOT', 'MUST', 'NEVER', 'ALWAYS', 'ONLY', 'STOP', 'DO NOT', 'IMPORTANT', 'CRITICAL'];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHRASE_RE = new RegExp(COERCION_PHRASES.map(escape).join('|'), 'gi');
const TOKEN_RE = new RegExp(`(?<![A-Za-z0-9_])(?:${CAPS_TOKENS.map(escape).join('|')})(?![A-Za-z0-9_])`, 'g');

/** Raw hits (no allowlist) outside ``` fences: {file, line, match, rule}, 1-based lines. */
export function findCoercion(text, file) {
  const hits = [];
  let fenced = false;
  text.split('\n').forEach((l, i) => {
    if (/^\s*```/.test(l)) { fenced = !fenced; return; }
    if (fenced) return;
    for (const m of l.matchAll(PHRASE_RE)) hits.push({ file, line: i + 1, match: m[0], rule: 'phrase' });
    for (const m of l.matchAll(TOKEN_RE)) hits.push({ file, line: i + 1, match: m[0], rule: 'caps' });
  });
  return hits;
}

/**
 * Hits left after the allowlist ({file, linePattern, reason}); an entry without a reason throws.
 */
export function lintCoercion(text, file, allowlist = []) {
  return applyAllowlist(findCoercion(text, file), allowlist, text);
}

/** Allowlist entries that matched no hit in `targets` ({file, text}[]): stale entries fail (spec S3). */
export function unusedAllowlistEntries(targets, allowlist) {
  for (const e of allowlist) if (!e.reason || !e.reason.trim()) throw new Error(`allowlist entry for ${e.file} has no reason`);
  return allowlist.filter((e) => !targets.some((t) => {
    if (t.file !== e.file) return false;
    const lines = t.text.split('\n');
    return findCoercion(t.text, t.file).some((h) => e.linePattern.test(lines[h.line - 1] ?? ''));
  }));
}

/** The decoded SessionStart hook output text, run against the real plugin root. */
export function decodedHookOutput() {
  const res = spawnSync('/bin/sh', ['-c', `"${path.join(PLUGIN_ROOT, 'hooks', 'run-hook.cmd')}" session-start`], {
    env: { PATH: '/usr/bin:/bin', HOME: PLUGIN_ROOT, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    encoding: 'utf8',
  });
  const out = JSON.parse(res.stdout);
  return out.hookSpecificOutput?.additionalContext ?? out.additional_context ?? '';
}

export const HOOK_TARGET = 'hooks/session-start (decoded output)';

/** Everything the lint can check: every runtime markdown file plus the decoded hook output, as {file, text}. */
export function collectLintTargets() {
  return [
    ...listRuntimeMd().map((file) => ({ file, text: fs.readFileSync(path.join(PLUGIN_ROOT, file), 'utf8') })),
    { file: HOOK_TARGET, text: decodedHookOutput() },
  ];
}
