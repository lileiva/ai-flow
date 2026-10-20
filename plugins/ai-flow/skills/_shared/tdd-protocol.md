# TDD Guide

## 0. Purpose and how to read it

This is ai-flow's single guide to test-driven development. The implementer uses all of it, the debugger mostly §1-§2, §9 and §11, and the planner §3, §4, §7, §10 and §12. Read §1-§4 before your first task and look up the rest when a situation calls for it. Each practice comes with the reason behind it, so that you can use judgment when a case does not fit the rule.

The short version: for every behaviour change, write the test before the code, run it and watch it fail for the expected reason, make it pass with the smallest change, then clean up while green.

## 1. Why test-first

- **A test you never saw fail proves nothing.** A test written after the code usually passes on its first run, and it would often also pass if the code were wrong or missing (it asserts on a stub, or imports the wrong module). Seeing it fail while the behaviour is absent, then pass once it exists, is what makes it evidence.
- **It makes you specify behaviour from the caller's side.** Writing the test first forces you to choose names, inputs, outputs and errors as a user of the code sees them, before an implementation biases the interface.
- **Small steps localize mistakes.** When you are always minutes away from the last green, a surprise failure is in the few lines you just wrote. Large steps turn every failure into a debugging session.
- **The suite becomes the regression net and the executable spec.** Each scenario you encode keeps guarding the behaviour after you move on, and a later change that breaks it shows up at once.
- **In ai-flow, the red-to-green trail is the evidence.** The verifier and the evals check that a failing test came before the code.

The honest cost: each step feels slower, while the feature usually lands sooner and with fewer regressions. §10 covers the changes where the trade does not pay.

## 2. The loop: red, green, refactor

### RED: specify the next behaviour

Write one test for the next behaviour on your list (§3). Before running it, predict how it will fail. Then run it.

It should fail on the assertion that names the missing behaviour, e.g. `expected 'EUR 10.00', got undefined`. An import error, a syntax error or `X is not defined` means you are not red yet: the test never got as far as asking its question. Add the minimal scaffold (an empty function, an export that returns nothing) until the assertion is what fails.

Why: the failure message is your proof that the test checks what you think it checks. Without the run, you do not know whether the test can fail at all.

If it passes unexpectedly, find out which case you are in: the behaviour already exists (note it and pick the next test), the test is wrong (it asserts on a stub, a tautology or the wrong object), or it is not running (wrong file, filtered out). To prove a test can fail, break the code temporarily and watch it go red.

### GREEN: the smallest change that passes

Make the test pass with the least code. Three strategies:
- **Fake it:** return the constant the test expects. Useful when the general shape is not clear yet.
- **Obvious implementation:** when the right code is clear and small, write it.
- **Triangulate:** add a second example that a constant cannot satisfy (`format(10)` and then `format(2.5)`), which forces the general solution.

Then run the whole relevant suite, not only the new test, because the change can break its neighbours.

Why minimal: anything beyond what the test demands is code that no test has seen fail. That is where untested branches and speculative features hide.

### REFACTOR: improve the design while green

With every test green, remove duplication (especially between the test and the code, which is where faked constants turn into logic), improve names and simplify structure. Make one change at a time and re-run the tests after each. New behaviour is not refactoring: it needs its own RED.

Why on green: you can only restructure safely while the tests confirm that behaviour is unchanged. Refactoring on red mixes two kinds of change and hides which one broke things.

### Commit and record

Commit at green with the test and the code together; a separate refactor commit is fine. Record the evidence in apply-progress: the RED command with its failing assertion line, then the GREEN result, e.g. `RED: node --test cart.test.mjs -> "expected 3, got 0"; GREEN: 41/41 pass`.

## 3. The test list and choosing the next test

Before coding, turn the task's spec scenarios (Given/When/Then) and the edge cases you can already see into a short test list. Add to it whenever you discover a case, and cross items off as they go green. The list keeps you from holding everything in your head and from implementing ahead of your tests.

Pick the next test that teaches the most for the least code. ZOMBIES is a good default order:
- **Z**ero: empty input, no items, first use.
- **O**ne: a single item.
- **M**any: several items, collections, repetition.
- **B**oundaries: limits, off-by-one, maximum sizes.
- **I**nterface: settle the call shape while the cases are still simple.
- **E**xceptions: errors, invalid input, failing collaborators.
- **S**imple scenarios and simple solutions throughout.

Example, a cart total: `empty cart totals 0`, then `one item totals its price`, `two items are summed`, `quantity multiplies the price`, `a discount never makes the total negative`, `an unknown SKU raises NotFound`.

If the next test needs a big jump (many new lines, a new collaborator), it is too big. Pick a smaller test that moves toward it, or split it.

## 4. Granularity

A cycle should take minutes. If GREEN takes more than about ten minutes or touches many files, revert to the last green and choose a smaller test. You have learned the step was too big, which is cheaper than pushing through.

- One behaviour per test. Several assertions are fine when they describe one behaviour, e.g. the status and the body of one response.
- Test through the public interface at the unit of behaviour (a module, an endpoint, a command), not every method or private helper. Tests coupled to internals break on every refactor and still miss bugs.
- Name the behaviour, not the method: `rejects an empty email with ValidationError`, not `test_validate_2`. A failing test's name should tell the reader what broke.
- Follow the project's conventions for test file locations and names.

## 5. Test doubles: fakes, stubs and mocks

Vocabulary: a **dummy** fills a parameter; a **stub** returns canned answers to queries; a **fake** is a working lightweight implementation, such as an in-memory repository; a **spy** records calls; a **mock** is set up to verify an expected interaction.

Defaults, in order of preference:
1. Real objects for in-process code. They catch real integration mistakes.
2. Fakes for slow or nondeterministic boundaries: network, database, clock, randomness, and the filesystem when it matters.
3. Stubs for queries, e.g. "what is today's exchange rate?".
4. Mocks only for outgoing commands whose effect is the behaviour, e.g. "an email is sent" or "an event is published".

Do not mock what you do not own. Wrap a third-party API in a small adapter, double the adapter in your tests, and cover the adapter itself with a few integration tests against the real service. Inject the clock and the random source instead of reading them globally.

Signs of over-mocking: the test breaks on a refactor that changed no behaviour; the test restates the implementation line by line; the setup is longer than the assertion; the test checks that a stub returned what you told it to return.

## 6. Outside-in and inside-out

- **Inside-out (classic):** start with the core units and their real collaborators, then compose upward. Best when the domain logic is clear and the integration shape is simple.
- **Outside-in (London school):** start from an outer test at the entry point and discover the collaborators' interfaces with doubles as you go. Best when the integration shape is the open question.

The ai-flow default is a double loop: one outer failing acceptance or tracer test through the real entry point (§7), then inside-out inner cycles until it passes, with doubles only at true boundaries (§5). Example: for `POST /orders`, the outer test posts an order and expects 201 plus a stored row in a fake repository; inner tests cover price calculation and validation directly.
