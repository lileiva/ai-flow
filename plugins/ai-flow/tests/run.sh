#!/usr/bin/env bash
# Single test entrypoint for the ai-flow plugin (REQ-001, REQ-002).
# Runs: claude plugin validate (plugin + marketplace), the node:test structure suite, the evals tooling suite.
# Every step runs even if an earlier one fails. The last line is always `executed: N ...`.
#
# Self-test overrides (used by tests/structure/run-sh.test.mjs only):
#   AIFLOW_TESTS_STRUCTURE_GLOB  space-separated globs, relative to the repo root or absolute
#   AIFLOW_TESTS_EVALS_CMD       command for the evals tooling step
#   AIFLOW_TESTS_MIN_EXECUTED    executed-test floor
# User opt-out:
#   AIFLOW_TESTS_SKIP_VALIDATE=1 skip `claude plugin validate` (reported as SKIPPED, never counted as passed)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT" || exit 1

STRUCTURE_GLOB="${AIFLOW_TESTS_STRUCTURE_GLOB:-plugins/ai-flow/tests/structure/*.test.mjs}"
EVALS_CMD="${AIFLOW_TESTS_EVALS_CMD:-bash plugins/ai-flow/tests/test_evals_tooling.sh}"

STATUS=0
EXECUTED=0
PASSED=0
FAILED=0

# --- validate ---
VALIDATE_RUN=0
if [ "${AIFLOW_TESTS_SKIP_VALIDATE:-}" = "1" ]; then
  echo "SKIPPED: claude plugin validate (AIFLOW_TESTS_SKIP_VALIDATE=1)"
else
  for target in plugins/ai-flow .; do
    VALIDATE_RUN=$((VALIDATE_RUN + 1))
    if claude plugin validate "$target"; then PASSED=$((PASSED + 1)); else FAILED=$((FAILED + 1)); STATUS=1; fi
  done
fi
EXECUTED=$((EXECUTED + VALIDATE_RUN))

# --- structure ---
set -f
read -ra GLOBS <<<"$STRUCTURE_GLOB"
set +f
STRUCTURE_OUT="$(node --test "${GLOBS[@]}" 2>&1)" || STATUS=1
echo "$STRUCTURE_OUT"
STRUCTURE_N="$(grep -E '^(#|ℹ) tests [0-9]+' <<<"$STRUCTURE_OUT" | tail -1 | awk '{print $3}')"

# --- evals tooling ---
EVALS_OUT="$(bash -c "$EVALS_CMD" 2>&1)" || STATUS=1
echo "$EVALS_OUT"
EVALS_N="$(grep -E '^(#|ℹ) tests [0-9]+' <<<"$EVALS_OUT" | tail -1 | awk '{print $3}')"

EXECUTED=$((EXECUTED + ${STRUCTURE_N:-0} + ${EVALS_N:-0}))
echo "executed: ${EXECUTED} passed: ${PASSED} failed: ${FAILED} (structure ${STRUCTURE_N:-0}, evals ${EVALS_N:-0}, validate ${VALIDATE_RUN})"
exit "$STATUS"
