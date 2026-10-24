// Task 2.7 (REQ-007 S1-S4, B1-SC3): TDD grader discrimination on fixtures derived from the real tracer trace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTrace } from '../analyze.mjs';
import { RECIPES, makeFixture } from '../scripts/make-fixture.mjs';
import { classifyTestRun, covers } from '../lib/tdd.mjs';

const TRACES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'traces');
const read = (name) => fs.readFileSync(path.join(TRACES, `${name}.jsonl`), 'utf8');
const tddOf = (name) => analyzeTrace(read(name)).tdd;

test('[SC3-test-first] S1: test write -> red -> impl write -> green scores pass with ratio 1.0', () => {
  const t = tddOf('tdd-test-first');
  assert.equal(t.pass, true, t.reason);
  assert.equal(t.ratio, 1);
});

test('[SC3-impl-first] S2: impl edited before any test and no red before green scores fail, naming src/slugify.js', () => {
  const t = tddOf('tdd-impl-first');
  assert.equal(t.pass, false);
  assert.equal(t.ratio, 0);
  assert.match(t.reason, /src\/slugify\.js/);
});

test('S3: test written first but no failing run before green scores fail on criterion (ii)', () => {
  const t = tddOf('tdd-no-red');
  assert.equal(t.pass, false);
  assert.match(t.reason, /no failing run before green/);
});

test('S4: two impl files, one preceded by its test and one not, gives ratio 0.5 and fail', () => {
  const t = tddOf('tdd-partial');
  assert.equal(t.ratio, 0.5);
  assert.equal(t.pass, false);
  assert.deepEqual(t.impl_changes.map((c) => [c.file, c.test_first]), [['src/slugify.js', true], ['src/truncate.js', false]]);
});

test('an npm "Cannot find module" run is an env_error, never a red run', () => {
  const t = tddOf('npm-env-error');
  assert.equal(t.env_errors, 1);
  assert.equal(t.pass, false);
  assert.match(t.reason, /no failing run/);
});

test('committed fixtures equal what scripts/make-fixture.mjs derives from real-case-a.jsonl', () => {
  const real = read('real-case-a');
  for (const name of Object.keys(RECIPES)) assert.equal(read(name), makeFixture(real, name), name);
});

test('a test file covers an impl file by stem, by parent module dir, or any test covers a barrel index', () => {
  assert.ok(covers('test/slugify.test.js', 'src/slugify.js'));
  assert.ok(covers('test/slugify.diacritics.test.js', 'src/slugify.js'));
  assert.ok(covers('test/csv.test.js', 'src/csv/format.js'));
  assert.ok(covers('test/csv/parse.test.js', 'src/csv/parse.js'));
  assert.ok(covers('test/truncate-words.test.js', 'src/index.js'));
  assert.ok(!covers('test/slugify.test.js', 'src/truncate.js'));
});

// Task 2.8 (REQ-007 S5): a run that changes no implementation files is n/a, not pass or fail.
test('S5: no impl writes gives applicable:false and pass:null (excluded from aggregates)', () => {
  // Drops every line naming src/slugify.js: Write/Edit calls and, since D1, the Bash writes (python, sed -i, cp) too.
  const noImpl = read('tdd-test-first').split('\n').filter((l) => !/src\/slugify\.js/.test(l)).join('\n');
  const t = analyzeTrace(noImpl).tdd;
  assert.equal(t.applicable, false);
  assert.equal(t.pass, null);
  assert.equal(t.ratio, null);
});

// P4.6 finding (real case d): agents filter vitest output (`npm test | grep -E "Test|FAIL" | head`), so a red run
// can show only the "Failed Tests N" banner and per-test FAIL lines, without the "Tests N failed" summary.
test('classifyTestRun: filtered vitest output with only FAIL lines / the Failed Tests banner is red', () => {
  const filtered = '⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯\n FAIL  test/reading-time.test.js > readingTime > test_rounds_up\nTypeError: (0 , readingTime) is not a function\n';
  assert.equal(classifyTestRun(filtered), 'red');
  assert.equal(classifyTestRun(' FAIL  test/a.test.js > a > b\n'), 'red');
  assert.equal(classifyTestRun('Test Files  5 passed (5)\n      Tests  14 passed (14)\n'), 'green');
  assert.equal(classifyTestRun('grep: FAIL: no such file\n'), null);
});

// Batch 5 defect D1 (P5.1 live): sonnet's implementer often changes files with Bash (heredoc `cat >`, `sed -i`,
// python/node scripts) instead of Write/Edit; those writes must count as test/impl writes (REQ-007).
import { bashWriteTargets, gradeTdd, tddEvents } from '../lib/tdd.mjs';

test('bashWriteTargets: redirection, tee, sed -i, cp/mv and script writers name the written files', () => {
  assert.deepEqual(bashWriteTargets("cat > src/slugify.js <<'E'\nexport const x = 1;\nE"), ['src/slugify.js']);
  assert.deepEqual(bashWriteTargets('printf x >> test/slugify.test.js && npm test 2>&1 | tail -5'), ['test/slugify.test.js']);
  assert.deepEqual(bashWriteTargets("echo 'x' | tee -a test/a.test.js"), ['test/a.test.js']);
  assert.deepEqual(bashWriteTargets("sed -i '' 's/a/b/' src/slugify.js\ngrep -n b src/slugify.js"), ['src/slugify.js']);
  assert.deepEqual(bashWriteTargets('cp /tmp/new.js src/csv/format.js'), ['src/csv/format.js']);
  assert.deepEqual(bashWriteTargets("python3 - <<'E'\np='test/slugify.test.js'\ns=open(p).read()\nopen(p,'w').write(s+'x')\nE"), ['test/slugify.test.js']);
  assert.deepEqual(bashWriteTargets(`node -e "const fs=require('fs');let s=fs.readFileSync('src/slugify.js','utf8');fs.writeFileSync('src/slugify.js',s)"`), ['src/slugify.js']);
});

test('bashWriteTargets: reads, test runs and writes outside the repo are not writes', () => {
  assert.deepEqual(bashWriteTargets('cat src/slugify.js test/slugify.test.js; npm test 2>&1 | tail -40'), []);
  assert.deepEqual(bashWriteTargets('cat src/a.js > /dev/null; grep -c x src/a.js > $TMPDIR/n.txt'), []);
  assert.deepEqual(bashWriteTargets('sed -n 25,50p test/slugify.test.js | cat -v'), []);
});

const bash = (command, result = '', instance = 'impl#1') => ({ name: 'Bash', input: { command }, result, instance, agent: 'implementer' });
const RED = ' Test Files  1 failed (1)\n      Tests  1 failed | 3 passed (4)';
const GREEN = ' Test Files  1 passed (1)\n      Tests  4 passed (4)';

test('[SC3-test-first] Bash-only TDD (heredoc test, red, sed impl, green) is graded and passes', () => {
  const calls = [
    bash("cat >> test/slugify.test.js <<'E'\nit('x', () => {});\nE"),
    bash('npm test 2>&1 | tail -5', RED),
    bash("sed -i '' 's/a/b/' src/slugify.js"),
    bash('npm test 2>&1 | tail -5', GREEN),
  ];
  const g = gradeTdd(tddEvents(calls, '/w'));
  assert.equal(g.applicable, true);
  assert.equal(g.pass, true, g.reason);
  assert.deepEqual(g.impl_changes.map((c) => c.file), ['src/slugify.js']);
});

test('[SC3-impl-first] a Bash impl write before any test write is impl-first', () => {
  const calls = [bash("cat > src/slugify.js <<'E'\nx\nE"), bash("cat >> test/slugify.test.js <<'E'\ny\nE"), bash('npm test', GREEN)];
  const g = gradeTdd(tddEvents(calls, '/w'));
  assert.equal(g.pass, false);
  assert.match(g.reason, /impl-first by implementer: src\/slugify\.js/);
});

// Verify W5: the c-0 baseline reason blamed "impl-first" without saying who; the offending edit was a main-thread
// change after the implementer had finished. The reason must name the acting agent (and the earlier agent, if any).
test('[SC3-impl-first] the impl-first reason names the acting agent', () => {
  const calls = [bash("cat > src/slugify.js <<'E'\nx\nE"), bash("cat >> test/slugify.test.js <<'E'\ny\nE"), bash('npm test', GREEN)];
  assert.match(gradeTdd(tddEvents(calls, '/w')).reason, /^impl-first by implementer: src\/slugify\.js edited before any test file covering it$/);
});

test('[SC3-impl-first] a main-thread edit after the implementer changed the file names main and the implementer', () => {
  const impl = (command, result) => ({ ...bash(command, result), agent: 'ai-flow:implementer' });
  const main = (command) => ({ name: 'Bash', input: { command }, result: '', instance: 'main', agent: 'main' });
  const calls = [
    impl("cat >> test/csv.test.js <<'E'\nit('x', () => {});\nE"),
    impl('npm test', RED),
    impl("cat > src/csv/format.js <<'E'\nx\nE"),
    impl('npm test', GREEN),
    main("sed -i '' 's/a/b/' src/csv/format.js"),
  ];
  const g = gradeTdd(tddEvents(calls, '/w'));
  assert.equal(g.pass, false);
  assert.equal(g.reason, 'impl-first by main: src/csv/format.js edited before any test file covering it (after ai-flow:implementer had changed it)');
});

// B2b rework: the 2nd a-0 implementer ran a mutation check (`sed -i.bak ... src/slugify.js; mv src/slugify.js.bak
// src/slugify.js`) inside a python script that rewrote the test file. The script-writer heuristic named
// src/slugify.js.bak and the grader blamed it as an impl-first change. Backup/temp files are never impl or test files.
test('backup and editor temp files (.bak .orig .rej ~ .swp .#) are neither implementation nor test files', async () => {
  const { isImplFile, isTestFile } = await import('../lib/tdd.mjs');
  for (const f of ['src/slugify.js.bak', 'src/slugify.js.orig', 'src/slugify.js.rej', 'src/slugify.js~', 'src/.slugify.js.swp', 'src/.#slugify.js',
    'test/slugify.test.js.bak', 'test/slugify.test.js~', 'test/.#slugify.test.js']) {
    assert.equal(isImplFile(f), false, `impl: ${f}`);
    assert.equal(isTestFile(f), false, `test: ${f}`);
  }
  assert.equal(isImplFile('src/slugify.js'), true);
  assert.equal(isTestFile('test/slugify.test.js'), true);
});

test('[SC3-test-first] the a-0 mutation-check pattern does not grade src/slugify.js.bak as an impl change', () => {
  const script = "python3 - <<'E'\np='test/slugify.test.js'\ns=open(p,encoding='utf8').read()\nopen(p,'w',encoding='utf8').write(s)\nE\n"
    + "npx vitest run test/slugify.test.js 2>&1 | tail -15\n"
    + "sed -i.bak \"s/^    .normalize('NFD')$/    /\" src/slugify.js && npx vitest run 2>&1 | grep -E \"FAIL|Tests \" ; mv src/slugify.js.bak src/slugify.js";
  assert.equal(bashWriteTargets(script).includes('src/slugify.js.bak'), false);
  const calls = [
    bash("cat >> test/slugify.test.js <<'E'\nit('x', () => {});\nE"),
    bash('npm test 2>&1 | tail -5', RED),
    bash("cat > src/slugify.js <<'E'\nx\nE"),
    bash(script, GREEN),
  ];
  const g = gradeTdd(tddEvents(calls, '/w'));
  assert.deepEqual([...new Set(g.impl_changes.map((c) => c.file))], ['src/slugify.js']);
  assert.equal(g.pass, true, g.reason);
});

// B2b rework 2 (verify W2): in-place edits with a backup suffix (sed -i.bak, --in-place=SUFFIX) and perl -i were
// not recognised as writes, so impl-first edits made that way were undercounted. The backup file itself stays excluded.
test('bashWriteTargets: sed/perl in-place forms with or without a backup suffix name the edited file', () => {
  for (const cmd of [
    "sed -i.bak 's/a/b/' src/x.js",
    "sed -i'.bak' 's/a/b/' src/x.js",
    "sed -i '' 's/a/b/' src/x.js",
    "sed --in-place 's/a/b/' src/x.js",
    "sed --in-place=.orig 's/a/b/' src/x.js",
    "sed -E -i.bak 's/a/b/' src/x.js",
    "perl -pi -e 's/a/b/' src/x.js",
    "perl -i.bak -pe 's/a/b/' src/x.js",
  ]) assert.deepEqual(bashWriteTargets(cmd), ['src/x.js'], cmd);
  assert.deepEqual(bashWriteTargets("sed -i.bak 's/a/b/' src/x.js && mv src/x.js.bak src/x.js"), ['src/x.js']);
});

test('bashWriteTargets: sed/perl without in-place (stdout, -n, -e, perl -I/-M) are not writes', () => {
  for (const cmd of [
    "sed 's/a/b/' src/x.js",
    "sed -n 's/a/b/p' src/x.js",
    "sed -E -e 's/i/j/' src/x.js",
    "sed --expression='s/i/j/' src/x.js",
    "perl -pe 's/a/b/' src/x.js",
    "perl -ne 'print if /i/' src/x.js",
    "perl -Ilib -pe 's/a/b/' src/x.js",
    "perl -Mlib=src -ne 'print' src/x.js",
  ]) assert.deepEqual(bashWriteTargets(cmd), [], cmd);
});
