#!/usr/bin/env bash
# Offline self-tests for the evals tooling (REQ-019).
# Runs `node --test` over plugins/ai-flow/evals/tooling/test/ and propagates its exit code.
# No Claude API calls are made by these tests.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT" || exit 1

# node --test does not accept a bare directory on Node 26; pass a glob (expanded by node).
TEST_GLOB="plugins/ai-flow/evals/tooling/test/*.test.mjs"
OUTPUT_FILE="$(mktemp "${TMPDIR:-/tmp}/aiflow-evals-selftest.XXXXXX")"
trap 'rm -f "$OUTPUT_FILE"' EXIT

echo "=== evals tooling self-tests (node $(node --version)) ==="
node --test "$TEST_GLOB" 2>&1 | tee "$OUTPUT_FILE"
STATUS=${PIPESTATUS[0]}

TESTS_RUN="$(grep -E '^(#|ℹ) tests [0-9]+' "$OUTPUT_FILE" | tail -1 | awk '{print $3}')"
echo "=== executed tests: ${TESTS_RUN:-0}; exit ${STATUS} ==="
exit "$STATUS"
