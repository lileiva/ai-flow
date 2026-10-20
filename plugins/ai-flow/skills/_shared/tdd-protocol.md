# TDD Guide

## 0. Purpose and how to read it

ai-flow's single guide to test-driven development. The implementer uses all of it; the debugger mostly §1-§2, §9 and §11; the planner §3, §4, §7, §10 and §12. Read §1-§4 before your first task and the rest when you need it. Each practice comes with its reason, so you can use judgment when a case does not fit.

The short version: for every behaviour change, write the test before the code, run it and watch it fail for the expected reason, make it pass with the smallest change, then clean up while green.

## 1. Why test-first

- **A test you never saw fail proves nothing.** A test written after the code passes on its first run, and often would also pass if the code were wrong or missing (it asserts on a stub, or imports the wrong module). Seeing it fail while the behaviour is absent, then pass once it exists, is what makes it evidence.
- **It makes you specify behaviour from the caller's side.** You choose names, inputs, outputs and errors as a user of the code sees them, before an implementation biases the interface.
- **Small steps localize mistakes.** Minutes from the last green, a surprise failure is in the few lines you just wrote. Large steps turn every failure into a debugging session.
- **The suite becomes the regression net and the executable spec.** Each encoded scenario keeps guarding the behaviour after you move on.
- **In ai-flow, the red-to-green trail is the evidence.** The verifier and the evals check that a failing test came before the code.

The honest cost: each step feels slower; the feature usually lands sooner, with fewer regressions. §10 covers changes where the trade does not pay.

## 2. The loop: red, green, refactor

### RED: specify the next behaviour

Write one test for the next behaviour on your list (§3). Before running it, predict how it will fail. Then run it.

It should fail on the assertion that names the missing behaviour, e.g. `expected 'EUR 10.00', got undefined`. An import error, a syntax error or `X is not defined` means you are not red yet: the test never got as far as asking its question. Add the minimal scaffold (an empty function, an export that returns nothing) until the assertion is what fails.

Why: the failure message proves the test checks what you think it checks. Without the run, you do not know whether it can fail at all.

If it passes unexpectedly, find out why: the behaviour already exists (note it, pick the next test), the test is wrong (asserts on a stub, a tautology, the wrong object), or it is not running (wrong file, filtered out). To prove a test can fail, break the code temporarily and watch it go red.

### GREEN: the smallest change that passes

Make the test pass with the least code. Three strategies:
- **Fake it:** return the constant the test expects, when the general shape is not clear yet.
- **Obvious implementation:** when the right code is clear and small, write it.
- **Triangulate:** add a second example that a constant cannot satisfy (`format(10)` and then `format(2.5)`), which forces the general solution.

Then run the whole relevant suite, not only the new test: the change can break neighbours.

Why minimal: anything beyond what the test demands is code no test has seen fail, which is where untested branches and speculative features hide.

### REFACTOR: improve the design while green

With every test green, remove duplication (especially between test and code, where faked constants turn into logic), improve names, simplify structure. One change at a time, re-running the tests after each. New behaviour is not refactoring; it needs its own RED.

Why on green: you can only restructure safely while the tests confirm behaviour is unchanged. Refactoring on red mixes two kinds of change and hides which one broke things.

### Commit and record

Commit at green with the test and the code together; a separate refactor commit is fine. Record the evidence in apply-progress: the RED command with its failing assertion line, then the GREEN result, e.g. `RED: node --test cart.test.mjs -> "expected 3, got 0"; GREEN: 41/41 pass`.

## 3. The test list and choosing the next test

Before coding, turn the task's spec scenarios (Given/When/Then) and the edge cases you can see into a short test list. Add cases as you discover them; cross items off as they go green. The list keeps you from holding everything in your head and from implementing ahead of your tests.

Pick the next test that teaches the most for the least code. ZOMBIES is a good default order:
- **Z**ero: empty input, no items, first use.
- **O**ne: a single item.
- **M**any: several items, collections, repetition.
- **B**oundaries: limits, off-by-one, maximum sizes.
- **I**nterface: settle the call shape while the cases are still simple.
- **E**xceptions: errors, invalid input, failing collaborators.
- **S**imple scenarios and simple solutions throughout.

Example, a cart total: `empty cart totals 0`, then `one item totals its price`, `two items are summed`, `quantity multiplies the price`, `a discount never makes the total negative`, `an unknown SKU raises NotFound`.

If the next test needs a big jump (many new lines, a new collaborator), pick a smaller one that moves toward it, or split it.

## 4. Granularity

A cycle should take minutes. If GREEN takes more than about ten minutes or touches many files, revert to the last green and choose a smaller test; that is cheaper than pushing through.

- One behaviour per test. Several assertions are fine when they describe one behaviour, e.g. the status and the body of one response.
- Test through the public interface at the unit of behaviour (a module, an endpoint, a command), not every method or private helper. Tests coupled to internals break on every refactor and still miss bugs.
- Name the behaviour, not the method: `rejects an empty email with ValidationError`, not `test_validate_2`. A failing test's name should tell the reader what broke.

## 5. Test doubles: fakes, stubs and mocks

Vocabulary: a **dummy** fills a parameter; a **stub** returns canned answers to queries; a **fake** is a working lightweight implementation, such as an in-memory repository; a **spy** records calls; a **mock** is set up to verify an expected interaction.

Defaults, in order of preference:
1. Real objects for in-process code. They catch real integration mistakes.
2. Fakes for slow or nondeterministic boundaries: network, database, clock, randomness, and the filesystem when it matters.
3. Stubs for queries, e.g. "what is today's exchange rate?".
4. Mocks only for outgoing commands whose effect is the behaviour, e.g. "an email is sent" or "an event is published".

Do not mock what you do not own: wrap a third-party API in a small adapter, double the adapter, and cover the adapter with a few integration tests against the real service. Inject the clock and the random source instead of reading them globally.

Signs of over-mocking: the test breaks on a refactor that changed no behaviour; the test restates the implementation line by line; the setup is longer than the assertion; the test checks that a stub returned what you told it to return.

## 6. Outside-in and inside-out

- **Inside-out (classic):** core units first with real collaborators, then compose upward. Best when the domain logic is clear and the integration simple.
- **Outside-in (London school):** start from an outer test at the entry point and discover collaborator interfaces with doubles. Best when the integration shape is the open question.

The ai-flow default is a double loop: one outer failing acceptance or tracer test through the real entry point (§7), then inside-out inner cycles until it passes, with doubles only at true boundaries (§5). Example: for `POST /orders`, the outer test posts an order and expects 201 plus a stored row in a fake repository; inner tests cover price calculation and validation directly.

## 7. Acceptance and tracer tests first

For the tracer bullet and each vertical slice, start with one end-to-end test through the real entry point for the thinnest spec scenario. Watch it fail, then run the inner loop until it passes. It proves the pieces connect before you invest in any of them.

The outer test may stay red across several inner cycles. Do not commit a red suite: mark the test with the framework's todo/skip/pending while the slice is in progress (e.g. `test('...', { todo: 'slice 2' }, fn)`) and remove the marker when it goes green.

A plan's tracer sub-step only proves connectivity (the test crosses the new boundary and gets anything back); the behaviour sub-step then tests the real scenario.

## 8. Refactoring discipline

When:
- Only on green.
- Rule of three: tolerate a duplication twice and remove it the third time. Earlier abstractions usually guess wrong.
- Before a test that would be awkward to pass: make the change easy, then make the easy change.

How: small behaviour-preserving steps (rename, extract, inline, move), running the tests after each. If a step goes red, revert it rather than debug it; the step was too big.

Scope: the code your task touched and its immediate neighbours. A larger cleanup becomes its own plan task, so diffs stay reviewable.

Tests are code too: refactor them, but never in the same step as the code they cover, and check afterwards that the test still fails when the code is broken.

## 9. Legacy code, characterization tests and bug fixes

Changing untested code:
1. Find the change point and a seam where you can observe behaviour: a function boundary, an injectable dependency, the CLI output.
2. Pin the current behaviour with characterization tests: call the code and assert what it does now, even if it looks wrong. Report suspicious behaviour instead of silently fixing it.
3. Then TDD the change on top.

Example: before changing `formatInvoice`, assert the exact strings it returns today for three representative invoices. For complex output, a golden-master or snapshot test pins behaviour cheaply; review each snapshot diff like code.

Bug fixes: first write a test that reproduces the bug and fails for the bug's reason, e.g. `parses "1,5" as 1.5` failing with `got 1`. That is the debugger's RED. Then fix the root cause and run the full suite.

## 10. When TDD does not apply, and what replaces it

Red-green needs behaviour that can be absent. These changes have none; verify them another way:

| Change | Verification instead |
|---|---|
| Docs-only (README, prose) | Link and reference checks, or a structural test |
| Config-only (values in JSON/YAML, no logic) | Schema or validator (e.g. `claude plugin validate`), then the existing suite |
| Prompt-only (agent/skill markdown) | Structural test for required sections and references; a smoke run or evals for behaviour |
| Mechanical move or rename already covered by tests | The existing suite, before and after |
| Generated code | Test the generator or the output contract |
| Time-boxed spike | Throw the spike away, then TDD the real version |
| Visual layout | Visual or screenshot review |

When an artifact has a contract (required sections, resolvable references, a schema), write the structural test first and watch it fail. That is RED in all but name.

The exemption covers the kind of change, not its difficulty. Config that changes behaviour (a feature flag, a routing table, a retry limit) is not exempt: test the behaviour it switches.

Record each exemption in apply-progress as `TDD n/a: <reason>; verified by <command>`.

## 11. Failure modes

| Symptom | Why it hurts | What to do |
|---|---|---|
| Test passes immediately | It may test nothing | Find out why (§2); break the code to prove it can fail |
| Test fails for the wrong reason (import, typo, setup) | The assertion has not failed yet | Scaffold until the assertion fails |
| Several tests written before any green | Big steps, muddled failures | One failing test at a time; park the rest |
| Big-bang GREEN | Untested paths, long debugging | Revert; smaller test; fake it or triangulate |
| Testing private details | Breaks on refactor, misses bugs | Test through the public interface |
| Over-mocking | Green tests, broken integration | Real objects or fakes; mock only outgoing commands (§5) |
| Tautological test, e.g. asserting a stub's canned value | It can never fail | Assert on observable output |
| Weakening an assertion or editing the expected value to get green | Hides a real defect | Only with a spec reason; otherwise report the conflict |
| Flaky test | Red stops meaning anything | Control time, order and randomness |
| Running only the new test | Regressions slip through | Run the relevant suite at every green |
| Refactoring on red | You cannot tell which change broke it | Get green first, or revert |
| Gold-plating in GREEN | Code no test has seen fail | Add a test for it, or remove it |
| Snapshot rubber-stamping | Bugs get pinned as expected | Review every snapshot diff |
| Code written before its test | A test written against existing code cannot show it would catch its absence | Set the code aside (`git stash` or revert), write the test, watch it fail, bring the code back |
| Stuck after 3 attempts | Thrashing | Revert to the last green, stop, return `blocked` with the evidence |

## 12. Using this guide in ai-flow

**Implementer**, per task: read the spec scenario, update the test list, run the loop with the plan's test command, log RED and GREEN evidence (§2), and self-review against every Given/When/Then before committing. A task with a tracer sub-step gets a full loop per sub-step. A `TDD n/a` task runs and records its verification command (§10).

**Debugger:** root cause first. RED is the reproducing test (§9); characterize the surrounding code if it is untested; run the full suite after the fix.

**Planner:** every code task carries the spec reference, the test file path, test names in ZOMBIES order (§3), the exact test command, the expected RED failure text, a minimal GREEN hint and a refactor note. The tracer task leads with its acceptance test (§7). Docs, config and prompt tasks are marked `TDD n/a` with their verification command.

**Verifier:** look for red-before-green evidence (apply-progress entries, commit order) and for `TDD n/a` entries that name a verification command.

## 13. Test discovery

Before your first RED, find the test command in this order:
1. The plan's test command for the task.
2. `testRunner` in `.ai-flow.json`.
3. Detect it: `package.json` with jest/vitest -> `npm test` or `npx vitest run`; `pytest.ini`/`pyproject.toml` -> `pytest`; `Cargo.toml` -> `cargo test`; `go.mod` -> `go test ./...`.

Run it once before the first RED to prove it works, so a later failure is about your test, not the setup.
