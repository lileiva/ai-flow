// Artifact completeness (REQ-009). Artifact text comes from engram mem_save/mem_update inputs (classified by
// topic_key, else title) and from the hand-back of the agent that owns the artifact (proposer -> proposal, ...).
// Required sections are matched case-insensitively against markdown headings or bold labels.

const heading = (word) => new RegExp(`^\\s*(?:#{1,6}\\s*[^\\n]*\\b${word}|\\*\\*[^\\n*]*\\b${word}[^\\n*]*\\*\\*)`, 'im');

export const REQUIRED = {
  proposal: { intent: heading('intent'), scope: heading('scope'), risks: heading('risks?'), rollback: heading('rollback'), 'success criteria': heading('success criteria') },
  spec: { 'requirement ids': /\bREQ-\d+/, 'given/when/then': /\bGiven\b[\s\S]*?\bWhen\b[\s\S]*?\bThen\b/ },
  design: { decisions: heading('decisions?'), 'file changes': heading('file changes?'), 'testing strategy': heading('testing strategy') },
  plan: { tasks: heading('tasks?'), 'tracer bullet': heading('tracer'), batches: heading('batch(?:es)?') },
};

const OWNER = { proposer: 'proposal', specifier: 'spec', designer: 'design', planner: 'plan' };
const KINDS = Object.keys(REQUIRED);

export function missingSections(kind, text) {
  return Object.entries(REQUIRED[kind]).filter(([, re]) => !re.test(text)).map(([name]) => name);
}

/** Expected artifacts per case: e2e (a-c) and case (e) produce all four; case (d) produces none. */
export function expectedArtifacts(caseName) {
  return String(caseName ?? '').split('-')[0] === 'd' ? [] : KINDS;
}

function kindOf(input) {
  const key = String(input.topic_key ?? '').toLowerCase();
  const m = key.match(/(proposal|spec|design|plan)$/);
  if (m) return m[1];
  const title = String(input.title ?? '').toLowerCase();
  return KINDS.find((k) => new RegExp(`\\b${k}\\b`).test(title)) ?? null;
}

/** Collect artifact texts from tool calls ({ name, input, agent, result }) and Agent hand-backs. */
export function artifactTexts(calls, shortName = (t) => String(t).split(':').at(-1)) {
  const texts = Object.fromEntries(KINDS.map((k) => [k, []]));
  for (const c of calls) {
    if (/__mem_(save|update)$/.test(c.name)) {
      const kind = kindOf(c.input);
      if (kind && c.input.content) texts[kind].push(String(c.input.content));
    } else if ((c.name === 'Agent' || c.name === 'Task') && c.result) {
      const kind = OWNER[shortName(c.input?.subagent_type)];
      if (kind) texts[kind].push(c.result);
    }
  }
  return texts;
}

/** { applicable, score (complete/expected) | null, missing: ['plan: missing', 'proposal: rollback', ...], <kind>: { present, missing } }. */
export function gradeArtifacts(calls, caseName) {
  const expected = expectedArtifacts(caseName);
  const texts = artifactTexts(calls);
  const out = { applicable: expected.length > 0, score: null, missing: [] };
  let complete = 0;
  for (const k of KINDS) {
    const text = texts[k].join('\n\n');
    const present = text.trim().length > 0;
    const missing = present ? missingSections(k, text) : [...Object.keys(REQUIRED[k])];
    out[k] = { present, missing };
    if (!expected.includes(k)) continue;
    if (!present) out.missing.push(`${k}: missing`);
    else for (const m of missing) out.missing.push(`${k}: ${m}`);
    if (present && missing.length === 0) complete++;
  }
  if (expected.length) out.score = Math.round((complete / expected.length) * 1000) / 1000;
  return out;
}
