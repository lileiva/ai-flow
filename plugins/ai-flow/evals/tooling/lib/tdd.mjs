// TDD-adherence rule (REQ-007). For each implementation file changed by an agent instance:
//  (i)  a write to a test file COVERING it (see covers()) by the same instance precedes the impl write, with a
//       failing (red) test run between that test write and the impl write;
//  (ii) a red run is observed before the first green run that follows the instance's first impl write.
// pass = every impl change compliant AND (ii) holds. n/a when no impl file changed.
import path from 'node:path';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** Backup/temp files (sed -i.bak, patch .orig/.rej, editor ~ / .swp / .#lock) are never impl or test files. */
export function isBackupFile(rel) {
  return /(\.bak|\.orig|\.rej|~|\.swp)$/.test(rel) || /(^|\/)\.#[^/]*$/.test(rel);
}

export function isTestFile(rel) {
  if (isBackupFile(rel)) return false;
  return /(^|\/)test\/.*\.test\.[cm]?[jt]sx?$/.test(rel) || /\.test\.[^/]+$/.test(rel);
}

export function isImplFile(rel) {
  return rel.startsWith('src/') && !isBackupFile(rel) && !isTestFile(rel);
}

const stem = (rel) => path.posix.basename(rel).replace(/\.test\.[^/]+$/, '').replace(/\.[^./]+$/, '');

/**
 * Does test file `test` cover impl file `impl`? Heuristic: same stem (test/slugify.test.js, test/slugify.x.test.js
 * -> src/slugify.js), the impl's module directory (test/csv.test.js -> src/csv/format.js), or a barrel
 * src/index.* (re-exports), which any test write covers.
 */
export function covers(test, impl) {
  const implStem = stem(impl);
  if (implStem === 'index') return true;
  const testStem = stem(test);
  if (testStem === implStem || testStem.startsWith(`${implStem}.`)) return true;
  const dirs = path.posix.dirname(impl).split('/').filter((d) => d && d !== 'src');
  return dirs.includes(testStem);
}

/** Classify a Bash tool_result: 'red' | 'green' | 'env_error' | null. */
export function classifyTestRun(text) {
  if (!text) return null;
  if (/Cannot find module[^\n]*npm/.test(text)) return 'env_error';
  if (/Tests?\s+[^\n]*\d+ failed/.test(text) || /Test Files\s+\d+ failed/.test(text)) return 'red';
  // Filtered output (e.g. `npm test | grep FAIL | head`): vitest's "Failed Tests N" banner or per-test FAIL lines.
  if (/Failed Tests \d+/.test(text) || /^\s*FAIL\s+\S+\.test\.[cm]?[jt]sx?\b/m.test(text)) return 'red';
  if (/Tests\s+\d+ passed/.test(text)) return 'green';
  return null;
}

export function relPath(file, cwd) {
  if (!file) return null;
  const rel = cwd && path.isAbsolute(file) ? path.relative(cwd, file) : file;
  return rel.split(path.sep).join('/');
}

const unquote = (t) => t.replace(/^['"]+|['"]+$/g, '').replace(/^\.\//, '');
const SEGMENT_RE = /\n|;|&&|\|\||\|/;
const SCRIPT_WRITE_RE = /writeFileSync|writeFile\(|appendFileSync|open\([^)]*,\s*['"][wa]|\.write_text\(/;
// In-place edit flags, with an optional backup suffix: sed -i, -i.bak, -i'.bak', -Ei, --in-place[=SUFFIX];
// perl -pi, -i.bak (a cluster of no-argument switches containing i; -I/-M take arguments and are not in-place).
const SED_IN_PLACE_RE = /^(-[a-zA-Z]*i|--in-place(=|$))/;
const PERL_IN_PLACE_RE = /^-[aclnpstuwEUTWX0-9]*i/;
const PATH_TOKEN_RE = /[\w./$-]*(?:src|tests?)\/[\w./-]+\.[A-Za-z0-9]+/g;

/**
 * Test/impl files a Bash command writes (heuristic, REQ-007 with Bash-based edits): output redirection (`>`, `>>`),
 * `tee`, in-place `sed -i[SUFFIX]`/`--in-place[=SUFFIX]` and `perl -i[SUFFIX]`, the target of `cp`/`mv`, and every src/test path named by a script that writes files
 * (fs.writeFileSync, open(..., 'w'), write_text). Reads and test runs are not writes. Order of appearance, deduped.
 */
export function bashWriteTargets(command, cwd) {
  if (!command) return [];
  const raw = [];
  for (const m of command.matchAll(/(?<![0-9&>=-])>{1,2}\s*([^\s;&|<>()]+)/g)) raw.push(m[1]);
  for (const m of command.matchAll(/\btee\s+(?:-a\s+)?([^\s;&|]+)/g)) raw.push(m[1]);
  for (const seg of command.split(SEGMENT_RE)) {
    const words = seg.trim().split(/\s+/);
    if ((words[0] === 'sed' && words.some((w) => SED_IN_PLACE_RE.test(w)))
      || (words[0] === 'perl' && words.some((w) => PERL_IN_PLACE_RE.test(w)))) raw.push(...words.slice(1));
    if (/^(cp|mv)$/.test(words[0]) && words.length > 2) raw.push(words[words.length - 1]);
  }
  if (SCRIPT_WRITE_RE.test(command)) raw.push(...(command.match(PATH_TOKEN_RE) ?? []));
  const out = [];
  for (const t of raw) {
    const rel = relPath(unquote(t), cwd);
    if (rel && (isTestFile(rel) || isImplFile(rel)) && !out.includes(rel)) out.push(rel);
  }
  return out;
}

/** Ordered TDD events per agent instance. */
export function tddEvents(calls, cwd) {
  const events = [];
  for (const c of calls) {
    if (WRITE_TOOLS.has(c.name)) {
      const rel = relPath(c.input.file_path ?? c.input.notebook_path, cwd);
      if (!rel) continue;
      if (isTestFile(rel)) events.push({ kind: 'test_write', file: rel, instance: c.instance, agent: c.agent });
      else if (isImplFile(rel)) events.push({ kind: 'impl_write', file: rel, instance: c.instance, agent: c.agent });
    } else if (c.name === 'Bash') {
      for (const rel of bashWriteTargets(c.input?.command, cwd)) {
        events.push({ kind: isTestFile(rel) ? 'test_write' : 'impl_write', file: rel, instance: c.instance, agent: c.agent, via: 'bash' });
      }
      const kind = classifyTestRun(c.result);
      if (kind) events.push({ kind, instance: c.instance, agent: c.agent });
    }
  }
  return events;
}

export function gradeTdd(events) {
  const envErrors = events.filter((e) => e.kind === 'env_error').length;
  const instances = [...new Set(events.filter((e) => e.kind === 'impl_write').map((e) => e.instance))];
  if (instances.length === 0) {
    return { applicable: false, pass: null, ratio: null, reason: 'no implementation changes', impl_changes: [], env_errors: envErrors };
  }
  const changes = [];
  const implFirst = [];
  const other = [];
  let criterionTwo = true;
  for (const inst of instances) {
    const ev = events.filter((e) => e.instance === inst);
    const seen = new Set();
    ev.forEach((e, i) => {
      if (e.kind !== 'impl_write' || seen.has(e.file)) return;
      seen.add(e.file);
      const before = ev.slice(0, i);
      const firstTest = before.findIndex((x) => x.kind === 'test_write' && covers(x.file, e.file));
      const testFirst = firstTest >= 0;
      const redSeen = testFirst && before.slice(firstTest).some((x) => x.kind === 'red');
      changes.push({ file: e.file, agent: e.agent, test_first: testFirst, red_seen: redSeen });
      if (!testFirst) {
        const earlier = changes.find((c) => c.file === e.file && c.agent !== e.agent);
        implFirst.push(`impl-first by ${e.agent}: ${e.file} edited before any test file covering it${earlier ? ` (after ${earlier.agent} had changed it)` : ''}`);
      }
      else if (!redSeen) other.push(`no failing run between test write and ${e.file}`);
    });
    const firstImpl = ev.findIndex((e) => e.kind === 'impl_write');
    const firstGreen = ev.findIndex((e, i) => i > firstImpl && e.kind === 'green');
    const redBefore = ev.slice(0, firstGreen < 0 ? ev.length : firstGreen).some((e) => e.kind === 'red');
    if (!redBefore) criterionTwo = false;
  }
  const compliant = changes.filter((c) => c.test_first && c.red_seen).length;
  const ratio = compliant / changes.length;
  const pass = ratio === 1 && criterionTwo;
  const reasons = [...implFirst, ...(criterionTwo ? [] : ['no failing run before green']), ...other];
  return { applicable: true, pass, ratio, reason: pass ? 'test-first with red before green' : reasons[0], impl_changes: changes, env_errors: envErrors };
}
