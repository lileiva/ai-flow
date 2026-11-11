// Case discovery mirroring `claude plugin eval` (design F1): any directory under <plugin>/evals/ that holds a
// prompt.md or a case.yaml IS a case. Case id = leading letter of the case name (a-e2e-bugfix-slugify -> a).
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

const SKIP = new Set(['node_modules', '.git', 'results']);

export function discover(pluginDir) {
  const evals = path.join(pluginDir, 'evals');
  const cases = [];
  const walk = (dir) => {
    const names = fs.readdirSync(dir);
    if (names.includes('prompt.md') || names.includes('case.yaml')) {
      const name = path.basename(dir);
      const prompt = path.join(dir, 'prompt.md');
      const data = fs.existsSync(prompt) ? parseFrontmatter(fs.readFileSync(prompt, 'utf8')).data : {};
      cases.push({ id: name.split('-')[0], name, dir, rel: path.relative(evals, dir).split(path.sep).join('/'), data });
    }
    for (const n of names.sort()) {
      if (SKIP.has(n)) continue;
      const p = path.join(dir, n);
      if (fs.lstatSync(p).isDirectory()) walk(p);
    }
  };
  walk(evals);
  return cases;
}

export const SUITE_IDS = ['a', 'b', 'c', 'd', 'e'];
export const KINDS = ['e2e', 'per-phase'];
export const SIZES = ['trivial', 'small', 'medium'];

/**
 * Structural check of the suite (REQ-001). Returns [{ kind, case, message }] where kind is
 * 'location' (case outside evals/cases/), 'unexpected' (not one of the pinned ids, or a duplicate id),
 * 'missing' (pinned id absent) or 'metadata' (no kind/size tag).
 */
export function checkSuite(pluginDir, { expected = SUITE_IDS } = {}) {
  const errors = [];
  const cases = discover(pluginDir);
  const seen = new Set();
  for (const c of cases) {
    if (!c.rel.startsWith('cases/')) {
      errors.push({ kind: 'location', case: c.name, message: `evals/${c.rel} holds prompt.md or case.yaml outside evals/cases/ and would be discovered as a case` });
      continue;
    }
    if (!expected.includes(c.id) || seen.has(c.id)) {
      errors.push({ kind: 'unexpected', case: c.name, message: `unexpected case evals/${c.rel} (the suite is pinned at ${expected.join(',')})` });
      continue;
    }
    seen.add(c.id);
    const tags = Array.isArray(c.data.tags) ? c.data.tags : [];
    if (tags.filter((t) => KINDS.includes(t)).length !== 1) errors.push({ kind: 'metadata', case: c.name, message: `${c.name}: missing kind tag (one of ${KINDS.join('|')})` });
    if (tags.filter((t) => SIZES.includes(t)).length !== 1) errors.push({ kind: 'metadata', case: c.name, message: `${c.name}: missing size tag (one of ${SIZES.join('|')})` });
  }
  for (const id of expected) if (!seen.has(id)) errors.push({ kind: 'missing', case: id, message: `case ${id} is missing` });
  return errors;
}
