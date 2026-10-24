#!/usr/bin/env node
// Turn a kept eval run dir (<kept>/out/trace.jsonl + <kept>/config/projects/<slug>/<session>/subagents/) or a
// retained run bundle (results/<ts>/traces/<case>-<i>/) into a small offline nested fixture (B2b REQ-015):
// trace.jsonl and subagents/agent-<id>.jsonl trimmed by trim-trace (user/assistant transcript lines only),
// agent-<id>.meta.json and mock-calls.jsonl copied. Every file is scrubbed of local paths and emails.
// Usage: node scripts/make-nested-fixture.mjs <kept-dir|bundle-dir> <out-dir> [--home /home/me]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trimTrace } from './trim-trace.mjs';
import { keepTranscriptLine, keptSubagentsDir } from '../lib/nested.mjs';
import { scrubEmails, scrubLocalPaths } from '../lib/scrub.mjs';

const sessionIdOf = (text) => text.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((o) => o?.type === 'system' && o.subtype === 'init')?.session_id ?? null;

/** { trace, subagents, mockCalls } paths of a kept run dir or a bundle dir. */
function sources(src) {
  if (fs.existsSync(path.join(src, 'config', 'projects'))) {
    const trace = path.join(src, 'out', 'trace.jsonl');
    const session = fs.existsSync(trace) ? sessionIdOf(fs.readFileSync(trace, 'utf8')) : null;
    return { trace, subagents: keptSubagentsDir(src, session), mockCalls: path.join(src, 'out', 'mock-calls.jsonl') };
  }
  return { trace: path.join(src, 'trace.jsonl'), subagents: path.join(src, 'subagents'), mockCalls: path.join(src, 'mock-calls.jsonl') };
}

export function makeNestedFixture(src, out, { home = os.homedir() } = {}) {
  const scrub = (t) => scrubEmails(scrubLocalPaths(t, { home }));
  const s = sources(src);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'subagents'), { recursive: true });
  if (fs.existsSync(s.trace)) fs.writeFileSync(path.join(out, 'trace.jsonl'), scrub(trimTrace(fs.readFileSync(s.trace, 'utf8'), { home })));
  if (fs.existsSync(s.mockCalls)) fs.writeFileSync(path.join(out, 'mock-calls.jsonl'), scrub(fs.readFileSync(s.mockCalls, 'utf8')));
  for (const f of s.subagents && fs.existsSync(s.subagents) ? fs.readdirSync(s.subagents).sort() : []) {
    const text = fs.readFileSync(path.join(s.subagents, f), 'utf8');
    if (f.endsWith('.meta.json')) fs.writeFileSync(path.join(out, 'subagents', f), scrub(text));
    else if (f.endsWith('.jsonl')) fs.writeFileSync(path.join(out, 'subagents', f), scrub(trimTrace(text.split('\n').filter(keepTranscriptLine).join('\n'), { home })));
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) { console.error('usage: node scripts/make-nested-fixture.mjs <kept-dir|bundle-dir> <out-dir> [--home /home/me]'); process.exit(2); }
  const hi = process.argv.indexOf('--home');
  makeNestedFixture(path.resolve(src), path.resolve(out), { home: hi > 0 ? process.argv[hi + 1] : os.homedir() });
  console.log(`fixture: ${out}`);
}
