#!/usr/bin/env bash
# Single test entrypoint for the ai-flow plugin (REQ-001, REQ-002).
# Runs: claude plugin validate (plugin + marketplace), the node:test structure suite, the evals tooling suite.
# Every step runs even if an earlier one fails. Exit 0 only if every step passed and the executed
# count is >= MIN_EXECUTED. The last line is always `executed: N passed: P failed: F (...)`.
#
# Requirements: node >= 20 (the evals tooling suite needs Node 26: `nvm use 26`), claude CLI >= 2.1.301.
#
# User opt-out:
#   AIFLOW_TESTS_SKIP_VALIDATE=1 skip `claude plugin validate` (reported as SKIPPED, never counted as passed)
# Self-test overrides (used by tests/structure/run-sh.test.mjs only; do not lower the floor elsewhere):
#   AIFLOW_TESTS_STRUCTURE_GLOB  space-separated globs, relative to the repo root or absolute
#   AIFLOW_TESTS_EVALS_CMD       command for the evals tooling step
#   AIFLOW_TESTS_MIN_EXECUTED    executed-test floor (default 790)
#   AIFLOW_TESTS_EVAL_CACHE_DIR  the .eval-cache dir checked for the prepare.mjs hint (default <repo>/.eval-cache)
#
# Prerequisite: `node plugins/ai-flow/evals/tooling/prepare.mjs` once (network) builds .eval-cache/. Without it
# about 47 evals tests skip and a few fail; run.sh then prints a hint naming prepare.mjs.

set -uo pipefail

# A parent node:test run (e.g. the run-sh self-test) must not suppress our own `node --test` children.
unset NODE_TEST_CONTEXT

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT" || exit 1

STRUCTURE_GLOB="${AIFLOW_TESTS_STRUCTURE_GLOB:-plugins/ai-flow/tests/structure/*.test.mjs}"
EVALS_CMD="${AIFLOW_TESTS_EVALS_CMD:-bash plugins/ai-flow/tests/test_evals_tooling.sh}"
MIN_EXECUTED="${AIFLOW_TESTS_MIN_EXECUTED:-790}"
EVAL_CACHE_DIR="${AIFLOW_TESTS_EVAL_CACHE_DIR:-$REPO_ROOT/.eval-cache}"

STATUS=0
EXECUTED=0
PASSED=0
FAILED=0
SUMMARY=()

summary_line() {
  echo "executed: ${EXECUTED} passed: ${PASSED} failed: ${FAILED} (structure ${STRUCTURE_N:-0}, evals ${EVALS_N:-0}, validate ${VALIDATE_N:-0})"
}

# --- node version ---
NODE_VERSION="$(node --version 2>/dev/null || echo 'none')"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if ! [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] || [ "$NODE_MAJOR" -lt 20 ]; then
  echo "FAIL: node >= 20 is required (found ${NODE_VERSION})"
  summary_line
  exit 1
fi

# Parse a node:test summary (spec `ℹ tests N` or TAP `# tests N`) and record the suite result.
# Usage: record_suite <name> <exit-status> <output>; sets <NAME>_N.
record_suite() {
  local name="$1" rc="$2" out="$3" n p f
  n="$(grep -E '^(#|ℹ) tests [0-9]+' <<<"$out" | tail -1 | awk '{print $3}')"
  p="$(grep -E '^(#|ℹ) pass [0-9]+' <<<"$out" | tail -1 | awk '{print $3}')"
  f="$(grep -E '^(#|ℹ) fail [0-9]+' <<<"$out" | tail -1 | awk '{print $3}')"
  if [ -z "$n" ]; then
    SUMMARY+=("${name}: CRASHED (no summary) exit ${rc}")
    FAILED=$((FAILED + 1))
    STATUS=1
    n=0
  else
    EXECUTED=$((EXECUTED + n))
    PASSED=$((PASSED + ${p:-0}))
    FAILED=$((FAILED + ${f:-0}))
    if [ "$rc" -eq 0 ]; then
      SUMMARY+=("${name}: ok (${n} tests)")
    else
      SUMMARY+=("${name}: FAILED (exit ${rc}; ${f:-0} of ${n} failed)")
      STATUS=1
    fi
  fi
  # Failing test names: TAP `not ok N - name`, spec `✖ name (Xms)`.
  local line
  while IFS= read -r line; do
    [ -n "$line" ] && SUMMARY+=("FAIL [${name}] ${line}")
  done < <(grep -E '^[[:space:]]*not ok [0-9]+ - |^✖ ' <<<"$out" | grep -v '✖ failing tests:' \
    | sed -E 's/^[[:space:]]*not ok [0-9]+ - //; s/^✖ //; s/ \([0-9.]+ms\)$//' | sort -u)
  printf -v "$(tr '[:lower:]' '[:upper:]' <<<"$name")_N" '%s' "$n"
}

# --- validate ---
VALIDATE_N=0
if [ "${AIFLOW_TESTS_SKIP_VALIDATE:-}" = "1" ]; then
  echo "=== validate: SKIPPED ==="
  SUMMARY+=("validate: SKIPPED (AIFLOW_TESTS_SKIP_VALIDATE=1)")
elif ! command -v claude >/dev/null 2>&1; then
  VALIDATE_N=1
  EXECUTED=$((EXECUTED + 1))
  FAILED=$((FAILED + 1))
  STATUS=1
  SUMMARY+=("validate: FAILED — claude CLI (>= 2.1.301) is required (or set AIFLOW_TESTS_SKIP_VALIDATE=1)")
else
  echo "=== validate ($(claude --version 2>/dev/null)) ==="
  for target in plugins/ai-flow .; do
    VALIDATE_N=$((VALIDATE_N + 1))
    EXECUTED=$((EXECUTED + 1))
    if claude plugin validate "$target"; then
      PASSED=$((PASSED + 1))
      SUMMARY+=("validate ${target}: ok")
    else
      FAILED=$((FAILED + 1))
      STATUS=1
      SUMMARY+=("validate ${target}: FAILED")
      SUMMARY+=("FAIL [validate] claude plugin validate ${target}")
    fi
  done
fi

# --- structure ---
echo "=== structure ==="
set -f
read -ra GLOBS <<<"$STRUCTURE_GLOB"
set +f
STRUCTURE_OUT="$(node --test --test-reporter=tap "${GLOBS[@]}" 2>&1)"
STRUCTURE_RC=$?
echo "$STRUCTURE_OUT"
record_suite structure "$STRUCTURE_RC" "$STRUCTURE_OUT"

# --- evals tooling ---
echo "=== evals ==="
EVALS_OUT="$(bash -c "$EVALS_CMD" 2>&1)"
EVALS_RC=$?
echo "$EVALS_OUT"
record_suite evals "$EVALS_RC" "$EVALS_OUT"

# --- summary ---
echo "=== summary ==="
printf '%s\n' "${SUMMARY[@]}"
# W4: cache-dependent evals tests skip (reason "no .eval-cache...") or fail when prepare.mjs has not been run.
CACHE_SKIPS="$(grep -cE '(# SKIP|^﹣ .*#) no \.eval-cache' <<<"$EVALS_OUT")"
if [ ! -d "$EVAL_CACHE_DIR" ] || [ "${CACHE_SKIPS:-0}" -gt 0 ]; then
  [ -d "$EVAL_CACHE_DIR" ] && CACHE_STATE="is incomplete" || CACHE_STATE="is missing"
  echo "NOTE: .eval-cache ${CACHE_STATE} (${CACHE_SKIPS:-0} evals tests skipped for it): run \`node plugins/ai-flow/evals/tooling/prepare.mjs\` first (once, needs network). Without it cache-dependent evals tests skip or fail and the run can miss MIN_EXECUTED."
fi
if [ "$EXECUTED" -lt "$MIN_EXECUTED" ]; then
  echo "FAIL: executed ${EXECUTED} is below MIN_EXECUTED ${MIN_EXECUTED}"
  STATUS=1
fi
summary_line
exit "$STATUS"
