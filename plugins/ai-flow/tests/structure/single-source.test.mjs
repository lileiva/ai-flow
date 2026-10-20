// Single-source and contract checks for plugin runtime markdown (REQ-003 S2/S3, REQ-026).
//
// LEGACY-COVERAGE: every assertion of the retired grep scripts tests/test_batch{1,2,4}.sh, and where it went.
// (test_batch3_skill_sync.sh tested skill-sync only; it is retired with skill-sync in Task 1.4, REQ-027.)
// kept     = ported here as a contract test (named)       replaced = covered by another, stronger test (named)
// dropped  = intentionally not ported (reason)
//
// | legacy assertion                                                   | fate     | where / why |
// |--------------------------------------------------------------------|----------|-------------|
// | b1 REQ-010-S1 using-ai-flow: Instruction Priority                  | kept     | 'required sections: skills/using-ai-flow/SKILL.md' |
// | b1 REQ-010-S1 using-ai-flow: Flow Commands                         | kept     | same |
// | b1 REQ-010-S1 using-ai-flow: Command -> Agent Mapping              | kept     | same |
// | b1 REQ-010-S1 using-ai-flow: Dependency Graph                      | kept     | same |
// | b1 REQ-010-S1 using-ai-flow: Auto-invoke                           | kept     | same |
// | b1 REQ-010-S1 using-ai-flow: Orchestrator Rules                    | kept     | same |
// | b1 REQ-010-S1 using-ai-flow: Peer Dependencies                     | kept     | same |
// | b1 REQ-010-S2 using-ai-flow: SUBAGENT-STOP guard                   | kept     | 'using-ai-flow keeps the SUBAGENT-STOP guard' |
// | b1 REQ-010-S3 using-ai-flow mentions "agents/orchestrator.md"      | replaced | Task 2.5: names `ai-flow:orchestrator` (path refs are now forbidden, REQ-005) |
// | b1 REQ-010 metadata scope:                                         | dropped  | skill-sync retired (REQ-027); keys stay, B3 decides (decision 5) |
// | b1 REQ-010 metadata auto_invoke:                                   | dropped  | same |
// | b1 REQ-005-S1 hooks.json valid JSON                                | replaced | hook.test.mjs 'hooks.json registers run-hook.cmd session-start ...' (JSON.parse) |
// | b1 REQ-005-S1 SessionStart matcher + run-hook.cmd session-start    | replaced | same |
// | b1 REQ-005-S2 hooks.json has a hooks key                           | replaced | same |
// | b1 REQ-004 run-hook.cmd exists                                     | replaced | hook.test.mjs 'run-hook.cmd and session-start are executable in the git index' |
// | b1 REQ-004 run-hook.cmd CMDBLOCK                                   | kept     | 'run-hook.cmd is a cmd/bash polyglot ...' |
// | b1 REQ-004 run-hook.cmd exec bash                                  | kept     | same |
// | b1 REQ-004 run-hook.cmd Git Bash detection                         | kept     | same |
// | b1 REQ-004-S1 run-hook.cmd output == direct session-start output   | kept     | 'run-hook.cmd session-start output equals running session-start directly' |
// | b1 REQ-009 persistence-contract: none fallback mode                | kept     | 'required sections: skills/_shared/persistence-contract.md' (Fallback Mode: `none` heading, now a pointer) |
// | b1 REQ-009-S3 persistence-contract: inline artifacts               | kept     | 'engram fallback protocol: ...' (on engram-fallback.md since Task 3.3, REQ-009) |
// | b1 REQ-009-S4 persistence-contract: recommends installing engram   | kept     | same |
// | b1 REQ-009 persistence-contract: Artifact Store Mode section       | kept     | 'required sections: skills/_shared/persistence-contract.md' |
// | b1 REQ-009 persistence-contract: skip mem_* calls                  | kept     | 'engram fallback protocol: ...' |
// | b1 REQ-009 persistence-contract: multi-session limitation          | kept     | same |
// | b1 REQ-018-S1 engram-convention: Brainstorm row                    | replaced | 'topic keys: ...' (every tracked artifact has a convention row) |
// | b1 REQ-018-S1 engram-convention: flow/{change-name}/brainstorm     | replaced | same |
// | b1 REQ-018-S1 engram-convention: flow/auth-system/brainstorm       | kept     | 'engram-convention rows give an example per topic key' |
// | b1 REQ-018-S2 engram-convention: all existing rows                 | replaced | 'topic keys: ...' |
// | b2 REQ-006 S1 explorer: AskUserQuestion                            | kept     | 'explorer keeps its interactive discovery loop' |
// | b2 REQ-006 S1 explorer: Interactive Requirements Gathering         | kept     | 'required sections: agents/explorer.md' |
// | b2 REQ-006 S2 explorer: Readiness Gate                             | kept     | same |
// | b2 REQ-006 S2 explorer: "Ready to proceed"                         | kept     | 'explorer keeps its interactive discovery loop' |
// | b2 REQ-006 S2 explorer: "refine"                                   | dropped  | substring of "Refinement Round" (kept as a heading) |
// | b2 REQ-006 S3 explorer: Refinement Round                           | kept     | 'required sections: agents/explorer.md' |
// | b2 REQ-006 S3 explorer: "follow-up"                                | kept     | 'explorer keeps its interactive discovery loop' |
// | b2 REQ-006 S4 explorer: "3" (max rounds)                           | replaced | 'explorer keeps its interactive discovery loop' (/3 (refinement )?rounds/), the old grep matched any "3" |
// | b2 REQ-006 S5 explorer: "readiness"                                | dropped  | implied by the Readiness Gate heading |
// | b2 REQ-007 S1 explorer: flow/{change-name}/brainstorm              | replaced | 'topic keys: ...' (producer mentions its key) |
// | b2 REQ-007 S1 explorer: "refined problem statement"                | kept     | 'explorer keeps its interactive discovery loop' |
// | b2 REQ-007 S2 explorer: "brainstorm"                               | replaced | 'topic keys: ...' |
// | b2 REQ-007 explorer return contract mentions brainstorm            | replaced | same (the old grep did not look at the return contract) |
// | b2 REQ-019 S1 flow-explore: iterative                              | kept     | 'flow-explore summarizes the iterative discovery loop' |
// | b2 REQ-019 S1 flow-explore: refinement                             | kept     | same |
// | b2 REQ-019 S1 flow-explore: readiness                              | kept     | same |
// | b2 REQ-019 S1 flow-explore: brainstorm                             | kept     | same |
// | b2 REQ-019 S2 flow-explore: "explorer"                             | kept     | 'phase skill names its agent: flow-explore' (Task 2.3 tightens to ai-flow:explorer) |
// | b2 REQ-019 S2 flow-explore: "agents/explorer.md"                   | replaced | Task 2.3: agent named, file paths forbidden (REQ-005, REQ-019) |
// | b2 REQ-012 S1 proposer: flow/{change-name}/brainstorm              | replaced | 'topic keys: ...' (consumer table row) + 'proposer treats the brainstorm as optional' |
// | b2 REQ-012 S1 proposer: OPTIONAL                                   | kept     | 'proposer treats the brainstorm as optional' |
// | b2 REQ-012 S2 proposer: "not found"                                | kept     | same |
// | b2 REQ-008 S1 orchestrator: Skill Creation Detection               | kept     | 'required sections: agents/orchestrator.md' |
// | b2 REQ-008 S1 orchestrator: "reusable pattern"                     | kept     | 'orchestrator suggests (never forces) skill creation' |
// | b2 REQ-008 S3 orchestrator: skill-creator                          | kept     | same |
// | b2 REQ-008 S4 orchestrator: "suggest"                              | kept     | same |
// | b2 REQ-011 S1 x9 agents: engram fallback note                      | replaced | 'engram fallback pointer: agents/<x>.md ...' (all 11 agents, one shared file, REQ-009) |
// | b2 REQ-007 orchestrator: "brainstorm" (x2)                         | replaced | 'topic keys: ...' (Artifact Tracking row) |
// | b4 implementer: superpowers:test-driven-development                | dropped  | inverted in Task 4.3 (TDD guide is the single TDD source, decision 1) |
// | b4 implementer/debugger/verifier/explorer/orchestrator: Ecosystem Enhancement (x5) | kept | 'ecosystem enhancement: agents/<x>.md ...' |
// | b4 debugger: superpowers:systematic-debugging                      | kept     | same |
// | b4 verifier: superpowers:verification-before-completion            | kept     | same |
// | b4 explorer: superpowers:brainstorming                             | kept     | same |
// | b4 orchestrator: superpowers:dispatching-parallel-agents           | kept     | same |
// | b4 implementer: tdd-protocol.md reference                          | replaced | references.test.mjs 'implementer.md reads the TDD guide via ${CLAUDE_PLUGIN_ROOT}' |
// | b4 debugger: Root Cause Investigation                              | kept     | 'required sections: agents/debugger.md' |
// | b4 verifier: "Iron Law"                                            | dropped  | asserting coercion phrases is retired (REQ-026 S3); B4 rewrites verifier prose |
// | b4 explorer: AskUserQuestion                                       | kept     | 'explorer keeps its interactive discovery loop' |
// | b4 x5 Ecosystem Enhancement has a fallback clause                  | kept     | 'ecosystem enhancement: agents/<x>.md ...' |
// | b4 orchestrator: Identity Inheritance                              | kept     | 'orchestrator identity inheritance is a conditional AGENTS.md overlay' |
// | b4 orchestrator: AGENTS.md                                         | kept     | same |
// | b4 orchestrator: Identity Inheritance conditional                  | kept     | same |
// | b4 orchestrator: Identity Inheritance is an overlay                | kept     | same |
// | b4 orchestrator: worktree                                          | kept     | 'orchestrator suggests worktrees as optional ...' |
// | b4 orchestrator: superpowers:using-git-worktrees                   | kept     | same |
// | b4 orchestrator: git worktree add fallback                         | kept     | same |
// | b4 orchestrator: worktree is optional                              | kept     | same |
// | b4 every skill: metadata.scope (per skill + total)                 | dropped  | skill-sync retired (REQ-027); keys kept for B3 (decision 5) |
// | b4 every skill: metadata.auto_invoke (per skill + total)           | dropped  | same |
// | b4 skill count >= 12                                               | dropped  | 11 after skill-sync; frontmatter.test.mjs checks every skill dir |
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLUGIN_ROOT, loadPhaseMap, listRuntimeMd } from '../lib/plugin-files.mjs';

const read = (rel) => fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');
const agentFiles = fs.readdirSync(path.join(PLUGIN_ROOT, 'agents')).filter((n) => n.endsWith('.md'));
const phaseSkills = fs.readdirSync(path.join(PLUGIN_ROOT, 'skills')).filter((n) => n.startsWith('flow-'));

/** Markdown heading texts (without the leading #s). */
function headings(text) {
  return [...text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);
}

/** Patterns (as source strings) that match no heading of `text`. */
function missingHeadings(text, patterns) {
  const hs = headings(text);
  return patterns.filter((p) => !hs.some((h) => p.test(h))).map(String);
}

/** Patterns (as source strings) that do not match anywhere in `text`. */
function missingMentions(text, patterns) {
  return patterns.filter((p) => !p.test(text)).map(String);
}

/** Body of the section whose heading matches `re`, up to the next heading of the same or higher level. */
function section(text, re) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && re.test(l));
  if (start < 0) return '';
  const level = /^#+/.exec(lines[start])[0].length;
  const end = lines.findIndex((l, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(l));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

// ---- required sections (REQ-003 S2) ----

const REQUIRED_SECTIONS = {
  'skills/using-ai-flow/SKILL.md': [/^Instruction Priority$/, /^Flow Commands$/, /Agent Mapping/, /^Dependency Graph$/, /^Auto-invoke/, /^Orchestrator Rules$/, /^Peer Dependencies$/],
  'skills/_shared/persistence-contract.md': [/Artifact Store Mode/, /Fallback Mode: `none`/],
  'agents/explorer.md': [/Interactive Requirements Gathering/, /Readiness Gate/, /Refinement Round/],
  'agents/orchestrator.md': [/Skill Creation Detection/, /Identity Inheritance/, /Artifact Tracking/],
  'agents/debugger.md': [/Root Cause Investigation/],
};

for (const [rel, patterns] of Object.entries(REQUIRED_SECTIONS)) {
  test(`required sections: ${rel}`, () => {
    assert.deepEqual(missingHeadings(read(rel), patterns), []);
  });
}

for (const file of agentFiles.filter((f) => f !== 'orchestrator.md')) {
  test(`return contract: agents/${file} has a "Return Contract" heading`, () => {
    assert.deepEqual(missingHeadings(read(`agents/${file}`), [/Return Contract/]), []);
  });
}

test('negative: a missing heading is reported, and a mention in prose does not count as a heading', () => {
  assert.deepEqual(missingHeadings('# Doc\n\nSee the Return Contract below.\n', [/Return Contract/]), ['/Return Contract/']);
  assert.deepEqual(missingHeadings('# Doc\n\n## Return Contract\n', [/Return Contract/]), []);
});

// ---- phase skills name their agent (tightened to ai-flow:<agent> in Task 2.3) ----

test('phase map loads: 10 flow-* skills, each mapped to an existing agent', () => {
  const map = loadPhaseMap();
  assert.equal(Object.keys(map).length, 10);
  assert.equal(map['flow-explore'], 'explorer');
  assert.equal(map['flow-init'], 'initializer');
  assert.equal(map['flow-debug'], 'debugger');
  for (const [skill, agent] of Object.entries(map)) assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'agents', `${agent}.md`)), `${skill} -> ${agent}`);
});

const SKILL_AGENT = loadPhaseMap();

test('every flow-* skill has a mapped agent', () => {
  assert.deepEqual(phaseSkills.filter((s) => !SKILL_AGENT[s]), []);
});

/** null when the skill body opens with the self-guard for `agent` (REQ-019 S1, D2a), else the reason. */
function guardViolation(skillText, agent) {
  const body = skillText.replace(/^---\n[\s\S]*?\n---\n/, '');
  const first = body.split('\n').find((l) => l.trim()) ?? '';
  if (!first.includes(`If you are the \`ai-flow:${agent}\` agent`)) return `first body line is not the ai-flow:${agent} guard: '${first}'`;
  if (!/do not launch another/i.test(first)) return 'guard does not forbid launching another agent for this phase';
  return null;
}

for (const skill of phaseSkills) {
  const agent = SKILL_AGENT[skill];
  test(`phase skill opens with a self-delegation guard: ${skill} (ai-flow:${agent})`, () => {
    assert.equal(guardViolation(read(`skills/${skill}/SKILL.md`), agent), null);
  });
  test(`phase skill names its agent: ${skill} -> ai-flow:${agent}`, () => {
    assert.match(read(`skills/${skill}/SKILL.md`), new RegExp(`launch[^\n]*\\(subagent_type \`ai-flow:${agent}\`\\)|subagent_type \`ai-flow:${agent}\``));
  });
}

test('negative: a phase skill without the guard (or with a guard for another agent) is flagged', () => {
  assert.match(guardViolation('---\nname: flow-x\n---\n\nThis phase is handled by the **x** agent.\n', 'x'), /not the ai-flow:x guard/);
  assert.match(guardViolation('---\nname: flow-x\n---\nIf you are the `ai-flow:y` agent, ignore this skill. Do not launch another agent.\n', 'x'), /not the ai-flow:x guard/);
  assert.match(guardViolation('---\nname: flow-x\n---\nIf you are the `ai-flow:x` agent, ignore this skill.\n', 'x'), /does not forbid/);
});

for (const skill of ['flow-apply', 'flow-debug']) {
  test(`TDD guide references are READ_REFs: ${skill}`, () => {
    const lines = read(`skills/${skill}/SKILL.md`).split('\n').filter((l) => l.includes('tdd-protocol.md'));
    assert.ok(lines.length > 0, 'mentions the TDD guide');
    assert.deepEqual(lines.filter((l) => !l.includes('${CLAUDE_PLUGIN_ROOT}/skills/_shared/tdd-protocol.md')), []);
  });
}

// ---- orchestrator launches agents by type, never points them at phase skills (REQ-019 S2/S3, D2b) ----

/** Problems with the orchestrator "Sub-Agent Launch Template" section. */
function launchTemplateViolations(orchestratorText) {
  const t = section(orchestratorText, /Sub-Agent Launch Template/);
  if (!t) return ['no Sub-Agent Launch Template section'];
  const v = [];
  if (/Skill file:/i.test(t)) v.push('template tells the agent which skill file to load');
  if (/Read and follow .*flow-[a-z{}]+\/SKILL\.md/.test(t)) v.push('template tells the agent to read a phase SKILL.md');
  if (!/subagent_type/.test(t) || !t.includes('`ai-flow:{agent}`')) v.push('template does not launch by subagent_type `ai-flow:{agent}`');
  if (!t.includes('${CLAUDE_PLUGIN_ROOT}/skills/_shared/tdd-protocol.md')) v.push('shared protocol is not the tdd-protocol READ_REF');
  return v;
}

test('orchestrator launch template: agent by subagent_type, no skill file, TDD guide as READ_REF', () => {
  assert.deepEqual(launchTemplateViolations(read('agents/orchestrator.md')), []);
});

test('negative: a launch template that hands the agent a skill file is flagged', () => {
  const bad = '## Sub-Agent Launch Template\n1. **Skill file:** The corresponding `flow-{phase}` skill\n5. **Shared protocols:** `_shared/tdd-protocol.md`\n## Next\n';
  assert.deepEqual(launchTemplateViolations(bad), [
    'template tells the agent which skill file to load',
    'template does not launch by subagent_type `ai-flow:{agent}`',
    'shared protocol is not the tdd-protocol READ_REF',
  ]);
});

// ---- ported content contracts ----

test('using-ai-flow keeps the SUBAGENT-STOP guard', () => {
  assert.match(read('skills/using-ai-flow/SKILL.md'), /<SUBAGENT-STOP>[\s\S]+<\/SUBAGENT-STOP>/);
});

// Fallback protocol content: engram-fallback.md since Task 3.3; persistence-contract.md keeps a "Fallback Mode: none" pointer.
const FALLBACK_DOC = 'skills/_shared/engram-fallback.md';
const FALLBACK_MENTIONS = [/inline/i, /install[\s\S]{0,80}engram|engram[\s\S]{0,80}install/i, /mem_search|mem_save|mem_get_observation/, /multi-session|session[\s\S]{0,40}lost|conversation[\s\S]{0,20}ends/i];

test('engram fallback protocol: inline artifacts, skipped mem_* calls, install recommendation, multi-session limitation', () => {
  assert.deepEqual(missingMentions(read(FALLBACK_DOC), FALLBACK_MENTIONS), []);
});

test('negative: missingMentions reports each absent pattern', () => {
  assert.equal(missingMentions('Pass artifacts inline.', FALLBACK_MENTIONS).length, 3);
});

// Every agent points at the one engram-fallback file (REQ-009 S2/S3, REQ-028). Replaces the 9-agent inline-note check.
const FALLBACK_REF = '${CLAUDE_PLUGIN_ROOT}/skills/_shared/engram-fallback.md';
for (const file of agentFiles) {
  test(`engram fallback pointer: agents/${file} references engram-fallback.md exactly once`, () => {
    assert.equal(read(`agents/${file}`).split('\n').filter((l) => l.includes(FALLBACK_REF)).length, 1);
  });
}

// Signature text of the old per-agent paragraph; it may live only in engram-fallback.md.
const FALLBACK_SIGNATURES = [/skip mem_search\/mem_get_observation/i, /\(session context shows "engram not found"\)/, /skip engram calls/i];

/** Runtime files (other than engram-fallback.md) that still carry fallback-paragraph signature text. */
function fallbackDuplicates(files, readFile) {
  return files.filter((f) => !f.endsWith('_shared/engram-fallback.md') && FALLBACK_SIGNATURES.some((re) => re.test(readFile(f))));
}

test('no duplicated engram-fallback prose outside engram-fallback.md', () => {
  assert.deepEqual(fallbackDuplicates(listRuntimeMd(), read), []);
});

test('negative: an agent copy that still carries the old fallback paragraph is flagged', () => {
  const old = '**Engram fallback:** If engram is unavailable (session context shows "engram not found"), skip mem_search/mem_get_observation calls.';
  assert.deepEqual(fallbackDuplicates(['agents/x.md', 'skills/_shared/engram-fallback.md'], () => old), ['agents/x.md']);
});

test('explorer keeps its interactive discovery loop', () => {
  assert.deepEqual(missingMentions(read('agents/explorer.md'), [/AskUserQuestion/, /Ready to proceed/, /follow-up/, /refined problem statement/, /3 (refinement )?rounds|maximum of 3|max(imum)? 3/i]), []);
});

test('flow-explore summarizes the iterative discovery loop', () => {
  assert.deepEqual(missingMentions(read('skills/flow-explore/SKILL.md'), [/iterative/i, /refinement/i, /readiness/i, /brainstorm/i]), []);
});

test('proposer treats the brainstorm as optional and handles it missing', () => {
  assert.deepEqual(missingMentions(read('agents/proposer.md'), [/brainstorm[\s\S]{0,200}OPTIONAL|OPTIONAL[\s\S]{0,200}brainstorm/, /not found/]), []);
});

test('orchestrator suggests (never forces) skill creation for reusable patterns', () => {
  const s = section(read('agents/orchestrator.md'), /Skill Creation Detection/);
  assert.deepEqual(missingMentions(s, [/reusable pattern/i, /skill-creator/, /suggest/i]), []);
});

test('orchestrator identity inheritance is a conditional AGENTS.md overlay', () => {
  const s = section(read('agents/orchestrator.md'), /Identity Inheritance/);
  assert.deepEqual(missingMentions(s, [/AGENTS\.md/, /if.*exists|if one exists|if present/i, /overlay|on top of|in addition|complement/i]), []);
});

test('orchestrator suggests worktrees as optional, with a git worktree add fallback', () => {
  const o = read('agents/orchestrator.md');
  assert.deepEqual(missingMentions(o, [/superpowers:using-git-worktrees/, /git worktree add/, /worktree[\s\S]{0,400}(optional|suggest|never required|if available|consider)/i]), []);
});

const ECOSYSTEM = {
  implementer: /superpowers:dispatching-parallel-agents/,
  debugger: /superpowers:systematic-debugging/,
  verifier: /superpowers:verification-before-completion/,
  explorer: /superpowers:brainstorming/,
  orchestrator: /superpowers:dispatching-parallel-agents/,
};
for (const [agent, skillRe] of Object.entries(ECOSYSTEM)) {
  test(`ecosystem enhancement: agents/${agent}.md names its superpowers skill and stays self-sufficient without it`, () => {
    const s = section(read(`agents/${agent}.md`), /Ecosystem Enhancement/);
    assert.ok(s, 'has an Ecosystem Enhancement section');
    assert.deepEqual(missingMentions(s, [skillRe, /otherwise|not installed|not available|self-sufficient/i]), []);
  });
}

test('negative: section() scopes a check to one heading', () => {
  const t = '# A\n## Ecosystem Enhancement\nuse superpowers:x\n## Other\nnot installed\n';
  assert.deepEqual(missingMentions(section(t, /Ecosystem Enhancement/), [/not installed/]), ['/not installed/']);
});

test('run-hook.cmd is a cmd/bash polyglot (CMDBLOCK, Git Bash lookup, exec bash)', () => {
  assert.deepEqual(missingMentions(read('hooks/run-hook.cmd'), [/CMDBLOCK/, /Git\\bin\\bash\.exe/, /exec bash/]), []);
});

test('run-hook.cmd session-start output equals running session-start directly', () => {
  const env = { PATH: '/usr/bin:/bin', HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-home-')), CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT };
  const direct = spawnSync('bash', [path.join(PLUGIN_ROOT, 'hooks/session-start')], { env, encoding: 'utf8' });
  const viaWrapper = spawnSync('bash', [path.join(PLUGIN_ROOT, 'hooks/run-hook.cmd'), 'session-start'], { env, encoding: 'utf8' });
  assert.equal(direct.status, 0, direct.stderr);
  assert.ok(direct.stdout.length > 0);
  assert.equal(viaWrapper.stdout, direct.stdout);
});

// ---- engram fallback: one shared file (REQ-009 S1, D3) ----

const ENGRAM_FALLBACK = 'skills/_shared/engram-fallback.md';
const exists = (rel) => fs.existsSync(path.join(PLUGIN_ROOT, rel));

/** The engram install URL the SessionStart hook prints. */
function hookEngramUrl() {
  return /https:\/\/github\.com\/[^\s"']*engram/.exec(read('hooks/session-start'))?.[0];
}

/** Content problems of an engram-fallback document. */
function engramFallbackProblems(text, url) {
  const p = missingHeadings(text, [/When it applies/i, /Sub-agents/i, /Orchestrator/i, /Limitations/i]).map((h) => `heading ${h}`);
  const applies = section(text, /When it applies/i);
  const sub = section(text, /Sub-agents/i);
  const orch = section(text, /Orchestrator/i);
  p.push(...missingMentions(applies, [/engram not found/, /mem_\* tools[^.\n]*(absent|missing|not available)/i, /mem_\*[^.\n]*(errors?|fails?)/i]).map((m) => `detection ${m}`));
  p.push(...missingMentions(sub, [/skip[^.\n]*mem_search/i, /mem_get_observation/, /mem_save/, /inline[^.\n]*launch prompt|launch prompt[^.\n]*inline/i, /artifacts\[\]\.content/, /multi-session continuity/i]).map((m) => `sub-agents ${m}`));
  p.push(...missingMentions(orch, [/inline/i, /every launch/i]).map((m) => `orchestrator ${m}`));
  if (!url || !text.includes(url)) p.push(`install URL ${url} missing`);
  return p;
}

test('engram-fallback.md: detection, sub-agent and orchestrator actions, limitations, hook install URL', () => {
  assert.ok(exists(ENGRAM_FALLBACK), `${ENGRAM_FALLBACK} exists`);
  assert.deepEqual(engramFallbackProblems(read(ENGRAM_FALLBACK), hookEngramUrl()), []);
});

test('negative: an engram-fallback doc without the orchestrator section or the hook URL is flagged', () => {
  const bad = '# Engram fallback\n## When it applies\n"engram not found"; mem_* tools are absent; a mem_* call errors.\n## Sub-agents\nSkip mem_search, mem_get_observation and mem_save. Use the artifacts passed inline in the launch prompt. Return artifacts[].content. Warn: no multi-session continuity.\n## Limitations\nLost on compaction.\n';
  assert.deepEqual(engramFallbackProblems(bad, 'https://github.com/x/engram'), ['heading /Orchestrator/i', 'orchestrator /inline/i', 'orchestrator /every launch/i', 'install URL https://github.com/x/engram missing']);
});

// ---- state ownership: orchestrator, proposer and archivist write flow/{change}/state (REQ-023, D10) ----

/** Problems with how a doc describes state writers: both extra writers named in its state section, no stale claims. */
function stateWriterProblems(text, sectionRe) {
  const s = section(text, sectionRe);
  const p = [];
  if (!s) return [`no section ${sectionRe}`];
  for (const w of ['orchestrator', 'proposer', 'archivist']) if (!new RegExp(`\\b${w}\\b`).test(s)) p.push(`state section does not name the ${w}`);
  if (/sub-agents do not save state/i.test(text)) p.push('says sub-agents do not save state');
  if (/maintained only in the orchestrator's conversation/i.test(text)) p.push("says state lives only in the orchestrator's conversation");
  return p;
}

test('orchestrator.md names the orchestrator, proposer and archivist as state writers', () => {
  assert.deepEqual(stateWriterProblems(read('agents/orchestrator.md'), /DAG State Updates/), []);
});

test('persistence-contract.md names the same state writers and drops the conversation-only claim', () => {
  assert.deepEqual(stateWriterProblems(read('skills/_shared/persistence-contract.md'), /DAG State Persistence/), []);
});

test('Artifact Tracking: the DAG state row lists the proposer and archivist too', () => {
  const row = topicKeyRows(section(read('agents/orchestrator.md'), /Artifact Tracking/)).find((r) => r.type === 'state');
  assert.match(row.rest, /orchestrator[^|]*proposer[^|]*archivist/);
});

test('negative: a state section that omits the archivist (and keeps the stale sentence) is flagged', () => {
  const bad = '## DAG State Updates\nThe orchestrator saves state; sub-agents do not save state (except proposer).\n';
  assert.deepEqual(stateWriterProblems(bad, /DAG State Updates/), ['state section does not name the archivist', 'says sub-agents do not save state']);
});

// Two-step recovery is described once, in engram-convention.md (REQ-009 S4).
const NUMBERED_RECOVERY = (t) => /^\s*\d+\..*mem_search\(/m.test(t) && /^\s*\d+\..*mem_get_observation\(/m.test(t);

test('two-step recovery is spelled out in engram-convention.md only; persistence-contract.md points to it', () => {
  assert.ok(NUMBERED_RECOVERY(read('skills/_shared/engram-convention.md')), 'engram-convention has the numbered steps');
  const pc = read('skills/_shared/persistence-contract.md');
  assert.ok(!NUMBERED_RECOVERY(pc), 'persistence-contract restates the steps');
  assert.match(pc, /engram-convention\.md[^\n]*Two-Step Recovery|Two-Step Recovery[^\n]*engram-convention\.md/);
});

test('negative: a doc restating the numbered mem_search / mem_get_observation steps is detected', () => {
  assert.ok(NUMBERED_RECOVERY('1. `mem_search(query: k)` -> id\n2. `mem_get_observation(id)` -> content\n'));
});

// ---- topic-key consistency (replaces the per-file brainstorm greps) ----

/** Rows `| Artifact | `flow/{change-name}/<type>` | ... |` of a markdown table, as {artifact, type, rest}. */
function topicKeyRows(text) {
  return [...text.matchAll(/^\|\s*([^|]+?)\s*\|\s*`flow\/\{change-name\}\/([a-z-]+)`\s*\|(.*)$/gm)].map((m) => ({ artifact: m[1], type: m[2], rest: m[3] }));
}

/** Problems: tracked types missing from the convention table, or producers that never mention their key. */
function topicKeyProblems(orchestratorText, conventionText, readAgent) {
  const conv = new Set(topicKeyRows(conventionText).map((r) => r.type));
  const problems = [];
  for (const row of topicKeyRows(section(orchestratorText, /Artifact Tracking/))) {
    if (!conv.has(row.type)) problems.push(`${row.type}: not in engram-convention`);
    // The producer cell names one agent, optionally followed by "(also <agent>, <agent>)".
    for (const producer of row.rest.split('|')[0].match(/[a-z]+/g).filter((w) => w !== 'also')) {
      const text = readAgent(producer);
      if (text === null) problems.push(`${row.type}: producer '${producer}' has no agent file`);
      else if (!text.includes(`flow/{change-name}/${row.type}`)) problems.push(`${row.type}: agents/${producer}.md never mentions its key`);
    }
  }
  return problems;
}

const readAgentOrNull = (name) => (fs.existsSync(path.join(PLUGIN_ROOT, 'agents', `${name}.md`)) ? read(`agents/${name}.md`) : null);

test('topic keys: every tracked artifact is in the engram convention and its producer mentions its key', () => {
  const tracked = topicKeyRows(section(read('agents/orchestrator.md'), /Artifact Tracking/));
  assert.ok(tracked.length >= 10, `orchestrator tracks ${tracked.length} artifacts`);
  assert.deepEqual(topicKeyProblems(read('agents/orchestrator.md'), read('skills/_shared/engram-convention.md'), readAgentOrNull), []);
});

test('negative: topic-key check flags a type missing from the convention and a silent producer', () => {
  const orch = '## Artifact Tracking\n| A | Key | Producer |\n| Spec | `flow/{change-name}/spec` | specifier | Yes |\n| Notes | `flow/{change-name}/notes` | specifier | No |\n';
  const conv = '| Spec | `flow/{change-name}/spec` | x |\n';
  const problems = topicKeyProblems(orch, conv, () => 'writes flow/{change-name}/spec');
  assert.deepEqual(problems, ['notes: not in engram-convention', 'notes: agents/specifier.md never mentions its key']);
});

test('engram-convention rows give an example per topic key', () => {
  for (const row of topicKeyRows(read('skills/_shared/engram-convention.md'))) {
    assert.match(row.rest, new RegExp(`\`flow/[a-z-]+/${row.type}\``), `${row.type} example`);
  }
});

// ---- legacy retirement (REQ-026 S1, S3) ----

// test_batch3_skill_sync.sh goes with skill-sync (Task 1.4, references.test.mjs).
test('legacy grep-only batch scripts are retired', () => {
  const left = ['test_batch1.sh', 'test_batch2.sh', 'test_batch4.sh'].filter((n) => fs.existsSync(path.join(PLUGIN_ROOT, 'tests', n)));
  assert.deepEqual(left, []);
});

// Coercion phrases must not be asserted by tests (REQ-026 S3). The list itself is the only allowed occurrence.
const COERCION_PHRASES = ['Iron Law', 'No exceptions', 'Delete means delete', 'NEVER SKIP', 'non-negotiable', 'protocol violation'];

/**
 * Test-source lines whose string or regex literals contain a coercion phrase. Comments are skipped, and so are
 * the lines defining COERCION_PHRASES and COERCION_FIXTURE (the banned list and its negative-test data).
 */
function coercionAssertions(file, text) {
  return text.split('\n').flatMap((l, i) => {
    if (/^\s*(\/\/|#)/.test(l) || /COERCION_(PHRASES|FIXTURE) = /.test(l)) return [];
    const literals = [...l.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1|\/((?:\\.|[^/\n])+)\/[gimsuy]*/g)].map((m) => m[2] ?? m[3] ?? '');
    return literals.some((s) => COERCION_PHRASES.some((p) => s.toLowerCase().includes(p.toLowerCase()))) ? [`${file}:${i + 1}`] : [];
  });
}

test('no test source asserts coercion phrases', () => {
  const files = [];
  const walk = (dir) => {
    for (const n of fs.readdirSync(dir)) {
      const abs = path.join(dir, n);
      if (fs.statSync(abs).isDirectory()) { if (n !== 'fixtures') walk(abs); } else if (/\.(mjs|sh)$/.test(n)) files.push(abs);
    }
  };
  walk(path.join(PLUGIN_ROOT, 'tests'));
  const hits = files.flatMap((f) => coercionAssertions(path.relative(PLUGIN_ROOT, f), fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});

test('negative: a test that greps for a coercion phrase is flagged', () => {
  const COERCION_FIXTURE = 'if grep -q "Iron Law" verifier.md; then pass; fi\nassert.match(t, /no exceptions/i);\n# Iron Law in a comment\n';
  assert.deepEqual(coercionAssertions('x.sh', COERCION_FIXTURE), ['x.sh:1', 'x.sh:2']);
});

// ---- TDD guide: one de-coerced, budgeted guide (REQ-014, D4) ----

const TDD_GUIDE = 'skills/_shared/tdd-protocol.md';
const TDD_BUDGET = { words: 2600, chars: 18000 };

// Numbered sections "## N. Title" so that agents can point at "§N" (D4 outline §0-§13).
const TDD_SECTIONS = [
  [0, /purpose|how to (read|use)/i],
  [1, /why test.first/i],
  [2, /loop|red.*green.*refactor/i],
  [3, /test list|next test/i],
  [4, /granularity|step size/i],
  [5, /test doubles|fakes.*mocks/i],
  [6, /outside-in.*inside-out|inside-out.*outside-in/i],
  [7, /acceptance|tracer/i],
  [8, /refactor(ing)? discipline/i],
  [9, /legacy|characteri[sz]ation/i],
  [10, /when tdd does not apply/i],
  [11, /failure modes/i],
  [12, /in ai-flow/i],
  [13, /test discovery/i],
];

/** Body of guide section §n (the "## n. ..." heading up to the next h2), or '' when absent. */
const tddSection = (text, n) => section(text, new RegExp(`^##\\s+${n}\\.\\s`));

/** Banned coercion phrases found in `text` (case-insensitive). */
function coercionHits(text) {
  return COERCION_PHRASES.filter((p) => text.toLowerCase().includes(p.toLowerCase()));
}

/** Budget overruns of `text` against TDD_BUDGET. */
function budgetProblems(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const p = [];
  if (words > TDD_BUDGET.words) p.push(`words ${words} > ${TDD_BUDGET.words}`);
  if (text.length > TDD_BUDGET.chars) p.push(`chars ${text.length} > ${TDD_BUDGET.chars}`);
  return p;
}

const guide = () => read(TDD_GUIDE);

for (const [n, topic] of TDD_SECTIONS) {
  test(`TDD guide §${n} heading: ${topic}`, () => {
    const heading = headings(guide()).find((h) => new RegExp(`^${n}\\.\\s`).test(h));
    assert.ok(heading, `no "## ${n}. ..." heading`);
    assert.match(heading, topic);
  });
}

test('TDD guide carries no coercion phrases (REQ-014 S2)', () => {
  assert.deepEqual(coercionHits(guide()), []);
});

test(`TDD guide stays within ${TDD_BUDGET.words} words / ${TDD_BUDGET.chars} chars (REQ-014 S7, D4)`, () => {
  assert.deepEqual(budgetProblems(guide()), []);
});

test('TDD guide directs test-before-code and watching it fail for the expected reason (REQ-014 S4)', () => {
  assert.deepEqual(missingMentions(guide(), [
    /write the test (first|before)[^.\n]*(code|implementation)|test before (the )?(code|implementation)/i,
    /fail[^.\n]*for the (expected|right) reason/i,
  ]), []);
});

test('TDD guide §1 gives the reason behind each core practice (REQ-014 S2)', () => {
  assert.deepEqual(missingMentions(tddSection(guide(), 1), [/never (saw|seen)[^.\n]*fail/i, /caller/i, /small steps/i, /regression/i]), []);
});

test('TDD guide §2: RED, GREEN and REFACTOR each say why (REQ-014 S2)', () => {
  const loop = tddSection(guide(), 2);
  for (const step of ['RED', 'GREEN', 'REFACTOR']) {
    assert.match(section(loop, new RegExp(`^###\\s+${step}\\b`)), /\bwhy\b|because|so that/i, `${step} has no rationale`);
  }
});

for (const n of [3, 4, 5, 6, 9, 11]) {
  test(`TDD guide §${n} is concrete: it has an example or decision heuristic (REQ-014 S5)`, () => {
    assert.match(tddSection(guide(), n), /e\.g\.|\bexample\b|```/i);
  });
}

test('negative: a guide with a coercion phrase or over budget is flagged; a section without an example is not concrete', () => {
  const COERCION_FIXTURE = `# Guide\n\n## 2. The loop\n\n${COERCION_PHRASES[0]}: write tests.\n`;
  assert.deepEqual(coercionHits(COERCION_FIXTURE), [COERCION_PHRASES[0]]);
  assert.deepEqual(budgetProblems('word '.repeat(2700)), ['words 2700 > 2600']);
  assert.doesNotMatch(tddSection('## 3. Next test\nPick a good one.\n## 4. Granularity\nE.g. tiny.\n', 3), /e\.g\.|\bexample\b|```/i);
});

/** Problems with the exceptions section (§10): exempt kinds, their replacement verification, the config caveat, the record format. */
function exceptionsProblems(s10) {
  const p = [];
  const KINDS = { 'docs-only': /docs?(-only)?\b/i, 'config-only': /config(-only)?\b/i, 'prompt-only': /prompt(-only)?\b|agent\/skill markdown/i };
  const rows = s10.split('\n').filter((l) => l.startsWith('|'));
  for (const [kind, re] of Object.entries(KINDS)) {
    const row = rows.find((r) => re.test(r.split('|')[1] ?? ''));
    if (!row) p.push(`no row for ${kind}`);
    else if (!/validat|lint|structural|schema|smoke|eval|suite|check/i.test(row.split('|')[2] ?? '')) p.push(`${kind}: no replacement verification`);
  }
  if (!/behaviou?r[^.\n]*not exempt|not exempt[^.\n]*behaviou?r/i.test(s10)) p.push('behaviour-changing config is not called out as not exempt');
  if (!s10.includes('TDD n/a: <reason>; verified by <command>')) p.push('no "TDD n/a: <reason>; verified by <command>" record format');
  return p;
}

test('TDD guide §10: exempt kinds with replacement verification, behaviour-changing config not exempt (REQ-014 S3)', () => {
  assert.deepEqual(exceptionsProblems(tddSection(guide(), 10)), []);
});

test('TDD guide §11: failure-modes table with >= 10 rows incl. the key symptoms and the set-aside rationale', () => {
  const s11 = tddSection(guide(), 11);
  const rows = s11.split('\n').filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l)).slice(1);
  assert.ok(rows.length >= 10, `${rows.length} rows`);
  assert.deepEqual(missingMentions(s11, [/passes immediately/i, /fails for the wrong reason/i, /code written before its test[^\n]*set[^\n]*aside/i, /stuck after 3 attempts/i]), []);
});

test('TDD guide §12: implementer, debugger, planner (per-task fields) and verifier', () => {
  const s12 = tddSection(guide(), 12);
  assert.deepEqual(missingMentions(s12, [/\*\*Implementer/, /\*\*Debugger/, /\*\*Planner/, /\*\*Verifier/]), []);
  const planner = /\*\*Planner[\s\S]*?(?=\n\*\*|$)/.exec(s12)?.[0] ?? '';
  assert.deepEqual(missingMentions(planner, [/spec reference/i, /test file/i, /test command/i, /expected RED/i, /GREEN hint/i, /refactor note/i, /TDD n\/a/]), []);
});

test('TDD guide §13: plan -> .ai-flow.json testRunner -> stack detection, run once before the first RED (REQ-014 S6)', () => {
  const s13 = tddSection(guide(), 13);
  const at = (re) => s13.search(re);
  const order = [at(/plan/i), at(/`testRunner`/), at(/detect/i)];
  assert.ok(order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2], `order ${order}`);
  assert.match(s13, /\.ai-flow\.json/);
  assert.match(s13, /run it once before the first RED/i);
});

test('negative: an exceptions section without config caveat, record format or a prompt row is flagged', () => {
  const bad = '## 10. When TDD does not apply\n| Change | Instead |\n|---|---|\n| Docs-only | link check |\n| Config-only | |\n';
  assert.deepEqual(exceptionsProblems(bad), ['config-only: no replacement verification', 'no row for prompt-only', 'behaviour-changing config is not called out as not exempt', 'no "TDD n/a: <reason>; verified by <command>" record format']);
});
