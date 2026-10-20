// Frontmatter and runtime-shape checks for agents, skills and commands (REQ-003 S1, REQ-027 S1, D7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLUGIN_ROOT, parseFrontmatter, checkShape, untrackedOutsideEvals } from '../lib/plugin-files.mjs';

const FIXTURES = path.join(PLUGIN_ROOT, 'tests/fixtures/frontmatter');
const read = (rel) => fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');
const ls = (rel) => fs.readdirSync(path.join(PLUGIN_ROOT, rel));

const agents = ls('agents').filter((n) => n.endsWith('.md'));
const skillDirs = ls('skills').filter((n) => n !== '_shared' && fs.statSync(path.join(PLUGIN_ROOT, 'skills', n)).isDirectory());
const commands = ls('commands').filter((n) => n.endsWith('.md'));

// ---- parser ----

test('parseFrontmatter reads key: value, folded (>) blocks and nested maps', () => {
  const { data, body } = parseFrontmatter('---\nname: x\ndescription: >\n  one\n  two\nmetadata:\n  scope: [root]\n---\nBody\n');
  assert.equal(data.name, 'x');
  assert.equal(data.description, 'one two');
  assert.ok('metadata' in data);
  assert.equal(body, 'Body\n');
});

test('negative: malformed frontmatter throws', () => {
  assert.throws(() => parseFrontmatter(fs.readFileSync(path.join(FIXTURES, 'bad-yaml.md'), 'utf8')), /frontmatter/);
});

test('negative: a file without frontmatter throws', () => {
  assert.throws(() => parseFrontmatter('# just a heading\n'), /frontmatter/);
});

// ---- agents ----

for (const file of agents) {
  test(`agent frontmatter: agents/${file} has name == stem, a description, no model`, () => {
    const { data } = parseFrontmatter(read(`agents/${file}`));
    assert.equal(data.name, file.replace(/\.md$/, ''));
    assert.ok(typeof data.description === 'string' && data.description.trim().length > 0, 'description');
    assert.ok(!('model' in data), 'agents must not pin a model');
  });
}

// ---- skills ----

/** Violations for one skill directory: missing SKILL.md, name != dir, empty description. */
function skillViolations(dirAbs) {
  const file = path.join(dirAbs, 'SKILL.md');
  if (!fs.existsSync(file)) return [`${path.basename(dirAbs)}: SKILL.md missing`];
  const { data } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  const v = [];
  if (data.name !== path.basename(dirAbs)) v.push(`${path.basename(dirAbs)}: name '${data.name}' != dir`);
  if (!(typeof data.description === 'string' && data.description.trim())) v.push(`${path.basename(dirAbs)}: no description`);
  return v;
}

for (const dir of skillDirs) {
  test(`skill frontmatter: skills/${dir}/SKILL.md has name == dir and a description`, () => {
    assert.deepEqual(skillViolations(path.join(PLUGIN_ROOT, 'skills', dir)), []);
  });
}

test('negative: a skill whose name differs from its directory is flagged', () => {
  assert.deepEqual(skillViolations(path.join(FIXTURES, 'name-mismatch')), ["name-mismatch: name 'something-else' != dir"]);
});

// ---- commands ----

for (const file of commands) {
  test(`command frontmatter: commands/${file} has a description`, () => {
    const { data } = parseFrontmatter(read(`commands/${file}`));
    assert.ok(typeof data.description === 'string' && data.description.trim().length > 0);
  });
}

// ---- runtime shape (D7) ----

test('runtime shape: only allowed file kinds under the plugin root; no untracked files outside evals/', { todo: 'green in Task 1.4' }, () => {
  assert.deepEqual(checkShape(PLUGIN_ROOT), []);
  assert.deepEqual(untrackedOutsideEvals(), []);
});

test('negative: shape rule flags stray runtime files and directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-shape-'));
  for (const rel of ['agents/a.md', 'skills/s/SKILL.md', 'skills/s/assets/x.sh', 'skills/_shared/g.md', 'commands/c.md', 'hooks/hooks.json', 'scripts/sync.sh']) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), '');
  }
  fs.mkdirSync(path.join(root, '.claude/rules'), { recursive: true });
  assert.deepEqual(checkShape(root).sort(), ['.claude', 'scripts', 'skills/s/assets/x.sh']);
});
