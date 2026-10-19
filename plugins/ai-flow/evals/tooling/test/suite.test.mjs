// Task 0.7 (REQ-001 (a), REQ-003, REQ-005; D6, D7): structure of case (a), the unattended policy and the engram mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EVALS_DIR } from '../lib/paths.mjs';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import { KINDS, SIZES } from '../lib/discover.mjs';

// F2: prompt.md frontmatter keys accepted by `claude plugin eval` (unknown keys are load errors).
const ALLOWED_KEYS = new Set(['schema_version', 'name', 'description', 'tags', 'plugins', 'runs', 'expected_outcome', 'model',
  'max_turns', 'timeout_seconds', 'allowed_tools', 'append_system_prompt', 'env']);
const CASE_A = path.join(EVALS_DIR, 'cases', 'a-e2e-bugfix-slugify');
const POLICY = fs.readFileSync(path.join(EVALS_DIR, 'shared', 'unattended-policy.md'), 'utf8');
const MOCK = path.join(EVALS_DIR, 'mocks', 'plugin_engram_engram');

function loadCase(dir) {
  return parseFrontmatter(fs.readFileSync(path.join(dir, 'prompt.md'), 'utf8'));
}

test('parseFrontmatter reads scalars, inline lists and block scalars', () => {
  const { data, body } = parseFrontmatter('---\nname: x\nmax_turns: 5\ntags: [a, b-c]\ntext: |\n  line 1\n\n  line 2\n---\nBody here\n');
  assert.deepEqual(data, { name: 'x', max_turns: 5, tags: ['a', 'b-c'], text: 'line 1\n\nline 2\n' });
  assert.equal(body, 'Body here\n');
});

test('case (a) frontmatter uses only keys accepted by plugin eval', () => {
  const { data } = loadCase(CASE_A);
  const unknown = Object.keys(data).filter((k) => !ALLOWED_KEYS.has(k));
  assert.deepEqual(unknown, []);
  assert.ok(data.max_turns <= 200 && data.timeout_seconds <= 3600);
});

test('case (a) appends the shared unattended policy verbatim', () => {
  const { data } = loadCase(CASE_A);
  assert.equal(data.append_system_prompt.trimEnd(), POLICY.trimEnd());
  assert.match(POLICY, /AUTO-APPROVED GATE/);
  assert.match(POLICY, /EVAL-RUN-COMPLETE/);
});

test('case (a) declares exactly one kind tag and one size tag, plus its id tag', () => {
  const { data } = loadCase(CASE_A);
  assert.equal(data.tags.filter((t) => KINDS.includes(t)).length, 1);
  assert.equal(data.tags.filter((t) => SIZES.includes(t)).length, 1);
  assert.ok(data.tags.includes('case-a') && data.tags.includes('e2e') && data.tags.includes('trivial'));
});

test('case (a) never grants AskUserQuestion', () => {
  const { data } = loadCase(CASE_A);
  assert.ok(Array.isArray(data.allowed_tools));
  assert.ok(!data.allowed_tools.includes('AskUserQuestion'));
});

test('case (a) has at least one advisory grader', () => {
  const graders = fs.readdirSync(path.join(CASE_A, 'graders')).filter((f) => f.endsWith('.md'));
  assert.ok(graders.length >= 1);
});

test('engram mock exposes the real engram tool schemas', () => {
  const { tools } = JSON.parse(fs.readFileSync(path.join(MOCK, '_tools.json'), 'utf8'));
  const names = tools.map((t) => t.name);
  for (const n of ['mem_search', 'mem_get_observation', 'mem_save', 'mem_update']) assert.ok(names.includes(n), n);
  for (const t of tools) assert.equal(t.inputSchema?.type, 'object', t.name);
});

test('engram mock _server.md is a stateful agent mock answering every listed tool', () => {
  const { data, body } = parseFrontmatter(fs.readFileSync(path.join(MOCK, '_server.md'), 'utf8'));
  const { tools } = JSON.parse(fs.readFileSync(path.join(MOCK, '_tools.json'), 'utf8'));
  assert.equal(data.type, 'agent');
  assert.deepEqual([...data.tools].sort(), tools.map((t) => t.name).sort());
  assert.match(body, /verbatim/i);
  // P0.13: the agent mock rejected a mem_save without `type`; real engram only requires title + content.
  assert.match(body, /only title and content are required/i);
});

// Task 1.4 (REQ-001 S1-S3): filesystem discovery mirroring F1 (any dir under evals/ with prompt.md or case.yaml).
import { discover } from '../lib/discover.mjs';
import { PLUGIN_DIR } from '../lib/paths.mjs';

test('discover(pluginDir) finds the committed cases by id', () => {
  assert.ok(discover(PLUGIN_DIR).map((c) => c.id).includes('a'));
});

import { checkSuite, SUITE_IDS } from '../lib/discover.mjs';
import { tmpDir } from './helpers.mjs';

function pluginCopy() {
  const root = tmpDir('aiflow-suite-');
  fs.cpSync(path.join(PLUGIN_DIR, '.claude-plugin'), path.join(root, '.claude-plugin'), { recursive: true });
  fs.cpSync(EVALS_DIR, path.join(root, 'evals'), { recursive: true, filter: (s) => !s.includes(`${path.sep}results`) });
  return root;
}

test('S2: an extra case directory fails the structural check and is named', () => {
  const root = pluginCopy();
  fs.mkdirSync(path.join(root, 'evals', 'cases', 'z-stray'), { recursive: true });
  fs.writeFileSync(path.join(root, 'evals', 'cases', 'z-stray', 'prompt.md'), '---\nname: z-stray\ntags: [e2e, small]\n---\nhi\n');
  const errs = checkSuite(root).filter((e) => e.kind === 'unexpected');
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /cases\/z-stray/);
});

test('S3: a case missing its kind or size tag is reported with the case name and the missing field', () => {
  const root = pluginCopy();
  const p = path.join(root, 'evals', 'cases', 'a-e2e-bugfix-slugify', 'prompt.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('tags: [case-a, e2e, trivial, smoke]', 'tags: [case-a, smoke]'));
  const msgs = checkSuite(root).filter((e) => e.kind === 'metadata').map((e) => e.message);
  assert.ok(msgs.some((m) => /a-e2e-bugfix-slugify/.test(m) && /kind/.test(m)), msgs.join('\n'));
  assert.ok(msgs.some((m) => /a-e2e-bugfix-slugify/.test(m) && /size/.test(m)), msgs.join('\n'));
});

test('no prompt.md or case.yaml lives under fixtures/, tooling/ or mocks/ (they would be discovered as cases)', () => {
  const root = pluginCopy();
  fs.writeFileSync(path.join(root, 'evals', 'fixtures', 'textkit', 'case.yaml'), 'name: oops\n');
  const errs = checkSuite(root).filter((e) => e.kind === 'location');
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /fixtures\/textkit/);
  assert.deepEqual(checkSuite(PLUGIN_DIR).filter((e) => e.kind === 'location'), []);
});

test('the committed suite has no unexpected cases and complete metadata', () => {
  assert.deepEqual(checkSuite(PLUGIN_DIR).filter((e) => e.kind !== 'missing'), []);
});

test('S1: the suite is pinned at exactly 5 cases a-e, each with a kind and a size (REQ-001 S1)', () => {
  const cases = discover(PLUGIN_DIR);
  assert.deepEqual(cases.map((c) => c.id), SUITE_IDS);
  for (const c of cases) assert.ok(c.data.tags.some((t) => KINDS.includes(t)) && c.data.tags.some((t) => SIZES.includes(t)), c.name);
  assert.deepEqual(checkSuite(PLUGIN_DIR), []);
});

// Task 1.5 (REQ-003, F2): policy and frontmatter rules hold for every discovered case.
for (const c of discover(PLUGIN_DIR)) {
  test(`${c.name}: frontmatter keys are accepted by plugin eval, policy is verbatim, AskUserQuestion not granted`, () => {
    const unknown = Object.keys(c.data).filter((k) => !ALLOWED_KEYS.has(k));
    assert.deepEqual(unknown, [], `unknown keys in ${c.name}`);
    assert.equal(String(c.data.append_system_prompt ?? '').trimEnd(), POLICY.trimEnd(), `${c.name} policy differs from shared/unattended-policy.md`);
    assert.ok(Array.isArray(c.data.allowed_tools) && !c.data.allowed_tools.includes('AskUserQuestion'), `${c.name} grants AskUserQuestion`);
  });
}

// Task 2.4 (REQ-004 S1, REQ-005): case (d) seeded apply-only with per-case fixed engram mocks.
const CASE_D = path.join(EVALS_DIR, 'cases', 'd-phase-apply-seeded');
const D_MOCK = path.join(CASE_D, 'mocks', 'plugin_engram_engram');

test('case (d): mem_get_observation answers from fixtures/{input.id}.md and every seeded id has a fixture', () => {
  const get = fs.readFileSync(path.join(D_MOCK, 'mem_get_observation.md'), 'utf8');
  assert.match(get, /\{\{file:fixtures\/\{input\.id\}\.md\}\}/);
  const ids = [...fs.readFileSync(path.join(D_MOCK, 'mem_search.md'), 'utf8').matchAll(/#(\d+)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['401', '402', '403', '404']);
  for (const id of ids) assert.ok(fs.existsSync(path.join(D_MOCK, 'fixtures', `${id}.md`)), id);
});

// Required artifact sections (REQ-009), checked with the same grader the analyzer uses.
import { missingSections } from '../lib/artifacts.mjs';
const SEED_KINDS = { 401: 'proposal', 402: 'spec', 403: 'design', 404: 'plan' };

test('case (d): the seeded proposal/spec/design/plan carry their required sections', () => {
  for (const [id, kind] of Object.entries(SEED_KINDS)) {
    assert.deepEqual(missingSections(kind, fs.readFileSync(path.join(D_MOCK, 'fixtures', `${id}.md`), 'utf8')), [], `${id}.md (${kind})`);
  }
});

test('case (d): prompt asks for the apply phase only and to stop after apply; tags are per-phase/small/smoke', () => {
  const { data, body } = loadCase(CASE_D);
  assert.match(body, /only the AI-Flow apply phase/i);
  assert.match(body, /stop after apply/i);
  assert.match(body, /do not (run )?verify/i);
  assert.deepEqual(data.tags, ['case-d', 'per-phase', 'small', 'smoke']);
});

// Task 2.5 (REQ-004 S2, REQ-009): case (e) seeded propose+plan; the seed lives inline in a per-case agent mock.
import { checkSeedSync, extractSeed } from '../lib/seeds.mjs';
const CASE_E = path.join(EVALS_DIR, 'cases', 'e-phase-propose-plan-seeded');

test('case (e): the agent mock embeds seeds/explore.md verbatim between the seed markers', () => {
  const server = fs.readFileSync(path.join(CASE_E, 'mocks', 'plugin_engram_engram', '_server.md'), 'utf8');
  assert.equal(extractSeed(server), fs.readFileSync(path.join(CASE_E, 'seeds', 'explore.md'), 'utf8'));
  assert.deepEqual(checkSeedSync(CASE_E), []);
});

test('case (e): seed sync fails when only one of the two copies is edited', () => {
  const copy = tmpDir('aiflow-seed-');
  fs.cpSync(CASE_E, copy, { recursive: true });
  fs.appendFileSync(path.join(copy, 'seeds', 'explore.md'), '\nextra line\n');
  assert.match(checkSeedSync(copy).join(), /differ/);
});

test('case (e): prompt stops at the plan gate, no acceptance suite, tags per-phase/small', () => {
  const { data, body } = loadCase(CASE_E);
  assert.match(body, /STOP at the plan gate/);
  assert.match(body, /flow\/capitalize-options\/explore/);
  assert.equal(fs.existsSync(path.join(CASE_E, 'acceptance')), false);
  assert.deepEqual(data.tags, ['case-e', 'per-phase', 'small']);
  const graders = fs.readdirSync(path.join(CASE_E, 'graders')).sort();
  assert.deepEqual(graders, ['completed.md', 'no-subagent-ask.md', 'no-writes.md', 'stops-before-apply.md']);
});

// Task 4.3 (REQ-018 S2, B1-SC6): the README documents how to run, subset, compare, gate and promote the evals.
import { README_COMPARE_CMD } from '../lib/constants.mjs';
import { REPO_ROOT } from '../lib/paths.mjs';

function evalsSection() {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  const start = readme.indexOf('\n## Evals\n');
  const license = readme.indexOf('\n## License');
  assert.ok(start > 0, 'README has a "## Evals" section');
  assert.ok(start < license, '"## Evals" comes before "## License"');
  return readme.slice(start, readme.indexOf('\n## ', start + 1));
}

const README_MUST_COVER = [
  ['full-suite command', /bash plugins\/ai-flow\/evals\/run\.sh\s*\n/],
  ['--case subset', /--case /],
  ['--tag subset', /--tag smoke/],
  ['no cost cap by default', /no (USD )?cost cap by default/i],
  ['optional --max-cost-usd pass-through', /--max-cost-usd/],
  ['compare command', new RegExp(README_COMPARE_CMD.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))],
  ['regression rule: 1 stdev', /1 (baseline )?(stdev|standard deviation)/i],
  ['regression rule: 0.34 for rates', /0\.34/],
  ['gate', /--gate/],
  ['promote', /--promote v3\.4\.0/],
  ['Node 26 via nvm', /nvm install 26/],
  ['nvm PATH strategy', /PATH/],
  ['sonnet and opus baselines', /v3\.4\.0-sonnet\.json[\s\S]*v3\.4\.0-opus\.json|v3\.4\.0-opus\.json[\s\S]*v3\.4\.0-sonnet\.json/],
  ['known gap: auto-approved gates', /auto-approved/i],
  ['known gap: mocked engram', /mocked engram|engram is mocked/i],
  ['known gap: hook exit 126 as shipped', /126/],
  ['rate limit stops the run', /rate limit/i],
];
for (const [what, re] of README_MUST_COVER) {
  test(`README Evals section covers: ${what}`, () => assert.match(evalsSection(), re));
}

test('evals/README.md documents every runner exit code, including 7 (promotion refused)', () => {
  const doc = fs.readFileSync(path.join(EVALS_DIR, 'README.md'), 'utf8');
  for (const code of ['0', '1', '2', '3', '5', '6', '7']) assert.match(doc, new RegExp(`\\|\\s*${code}\\s*\\|`), `exit ${code}`);
  assert.match(doc, /measure-session-start/);
  assert.match(doc, /preflight\.mjs/);
});

// Task 4.4 (REQ-M01): the plugin still validates, and evals/ adds no runtime component.
import { spawnSync, execFileSync } from 'node:child_process';

const hasClaude = spawnSync('claude', ['--version'], { encoding: 'utf8' }).status === 0;

test('`claude plugin validate plugins/ai-flow` passes; a copy with a broken plugin.json fails', { skip: hasClaude ? false : 'claude CLI not installed' }, () => {
  const ok = spawnSync('claude', ['plugin', 'validate', PLUGIN_DIR], { encoding: 'utf8', timeout: 60000 });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const copy = path.join(tmpDir('aiflow-validate-'), 'ai-flow');
  fs.mkdirSync(path.join(copy, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(copy, '.claude-plugin', 'plugin.json'), '{ "name": ');
  const bad = spawnSync('claude', ['plugin', 'validate', copy], { encoding: 'utf8', timeout: 60000 });
  assert.notEqual(bad.status, 0, bad.stdout + bad.stderr);
});

const RUNTIME_DIRS = ['agents', 'skills', 'commands', 'hooks'];

/** Tracked + untracked (not ignored) files under plugins/ai-flow/<dir> in the working tree. */
function workingFiles(dir) {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', `plugins/ai-flow/${dir}`], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).filter((f) => fs.existsSync(path.join(REPO_ROOT, f))).sort();
}

for (const dir of RUNTIME_DIRS) {
  test(`evals/ adds no runtime components: ${dir}/ lists exactly the v3.4.0 files`, () => {
    const tagged = execFileSync('git', ['ls-tree', '-r', '--name-only', 'v3.4.0', `plugins/ai-flow/${dir}`], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).sort();
    assert.deepEqual(workingFiles(dir), tagged);
  });
}

// Task 4.5 (REQ-M02, user decision 2026-10-18): plugin.json and the marketplace entry are both 4.0.0-alpha.1 on
// the v4 branch (alphas live there, unmerged; main stays 3.4.0 until 4.0.0). U5's "marketplace stays 3.4.0" is dropped.
test('plugin.json is 4.0.0-alpha.1', () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, '.claude-plugin', 'plugin.json'), 'utf8')).version, '4.0.0-alpha.1');
});

test('marketplace.json metadata.version and plugins[0].version match plugin.json (4.0.0-alpha.1)', () => {
  const m = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(m.metadata.version, '4.0.0-alpha.1');
  assert.equal(m.plugins[0].version, '4.0.0-alpha.1');
});

test('`claude plugin validate .` reports no version warning and `claude plugin tag --dry-run` accepts the versions', { skip: hasClaude ? false : 'claude CLI not installed' }, () => {
  const v = spawnSync('claude', ['plugin', 'validate', REPO_ROOT], { encoding: 'utf8', timeout: 60000 });
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.doesNotMatch(v.stdout + v.stderr, /declares version|plugin\.json wins/i);
  const t = spawnSync('claude', ['plugin', 'tag', '--dry-run', '--force', PLUGIN_DIR], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60000 });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  assert.doesNotMatch(t.stdout + t.stderr, /mismatch/i);
});

test('CHANGELOG has a 4.0.0-alpha.1 entry: evals only, the SessionStart exit-126 finding, Node 26 prerequisite', () => {
  const log = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  const start = log.indexOf('## [4.0.0-alpha.1]');
  assert.ok(start >= 0 && start < log.indexOf('## [3.4.0]'), 'alpha.1 entry above 3.4.0');
  const entry = log.slice(start, log.indexOf('\n## [', start + 1));
  assert.match(entry, /evals/i);
  assert.match(entry, /no (changes to|change in) (agents|runtime)/i);
  assert.match(entry, /126/);
  assert.match(entry, /Node 26/);
  assert.match(entry, /marketplace/i);
});

// Task 4.9 (REQ-019 S2): the self-test coverage manifest. Each tag must appear in at least one test title.
const COVERAGE_TAGS = ['SC3-test-first', 'SC3-impl-first', 'phase-order', 'subagent-ask', 'readonly-write', 'cap-abort', 'regression'];

/** Tags from COVERAGE_TAGS missing from every test title in dir (titles: test('...') / test(`...`)). */
function missingCoverageTags(dir, tags = COVERAGE_TAGS) {
  const titles = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs'))
    .flatMap((f) => [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/\btest\(\s*(['`"])(.*?)\1/g)].map((m) => m[2]));
  return tags.filter((t) => !titles.some((title) => title.includes(`[${t}]`)));
}

test('coverage manifest: every REQ-019 tag appears in a test title', () => {
  assert.deepEqual(missingCoverageTags(path.join(EVALS_DIR, 'tooling', 'test')), []);
});

test('coverage manifest detects a missing tag', () => {
  const dir = tmpDir('aiflow-manifest-');
  fs.writeFileSync(path.join(dir, 'x.test.mjs'), "test('[phase-order] ok', () => {});\n");
  assert.deepEqual(missingCoverageTags(dir, ['phase-order', 'cap-abort']), ['cap-abort']);
});

// P4.6 finding: tool_used defaults to min 1, so a `max: 0` grader without `min: 0` can never pass ("expected 1..0").
test('every tool_used grader with max: 0 declares min: 0', () => {
  const bad = [];
  for (const c of discover(PLUGIN_DIR)) {
    const gdir = path.join(c.dir, 'graders');
    for (const f of fs.readdirSync(gdir).filter((x) => x.endsWith('.md'))) {
      const { data } = parseFrontmatter(fs.readFileSync(path.join(gdir, f), 'utf8'));
      if (data.type === 'tool_used' && Number(data.max) === 0 && Number(data.min) !== 0) bad.push(`${c.name}/graders/${f}`);
    }
  }
  assert.deepEqual(bad, []);
});

// Task 5.3 (REQ-018, B1-SC4 evidence): no leftover todo/skip markers; the CHANGELOG names the committed baseline.
const TEST_DIR = path.join(EVALS_DIR, 'tooling', 'test');
// Allowed skips are conditional on a missing cache, workspace or CLI (`{ skip }`, `{ skip: skipWs }`,
// `{ skip: hasClaude ? false : '...' }`); anything else (todo, test.skip, skip: true / '<reason>') is a leftover.
const LEFTOVER_RE = /\btodo\s*:|\btest\.(skip|todo)\(|\bit\.(skip|todo)\(|\{\s*skip:\s*(true|['"`])|\bTODO\b|\bFIXME\b/;

/** Lines in test files (except this check itself) that carry a leftover todo/skip marker. */
export function leftoverMarkers(dir = TEST_DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n')
    .map((l, i) => ({ f, i, l })).filter(({ l }) => LEFTOVER_RE.test(l) && !l.includes('LEFTOVER_RE'))).map(({ f, i, l }) => `${f}:${i + 1}: ${l.trim()}`);
}

test('no todo/skip markers in the tooling tests (only skips for a missing cache, workspace or CLI)', () => {
  assert.deepEqual(leftoverMarkers(), []);
});

test('the leftover-marker check catches a planted test.skip / todo', () => {
  const dir = tmpDir('aiflow-markers-');
  const planted = [`test.${'skip'}('a', () => {});`, `test('b', { ${'todo'}: 'later' }, () => {});`, "test('c', { skip }, () => {});"];
  fs.writeFileSync(path.join(dir, 'x.test.mjs'), planted.join('\n') + '\n');
  assert.equal(leftoverMarkers(dir).length, 2);
});

test('the CHANGELOG 4.0.0-alpha.1 entry names the committed sonnet baseline and its headline numbers', () => {
  const log = fs.readFileSync(path.join(EVALS_DIR, '..', '..', '..', 'CHANGELOG.md'), 'utf8');
  const start = log.indexOf('## [4.0.0-alpha.1]');
  const entry = log.slice(start, log.indexOf('\n## [', start + 1));
  assert.match(entry, /baselines\/v3\.4\.0-sonnet\.json/);
  assert.match(entry, /15\/15/);
});
