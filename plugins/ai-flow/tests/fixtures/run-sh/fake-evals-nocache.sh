#!/usr/bin/env bash
# Fixture for run-sh.test.mjs: an evals run without .eval-cache (2 tests skipped for the cache, spec reporter).
echo "﹣ regrade on a copy of a stub results dir (0.02ms) # no .eval-cache (run prepare.mjs)"
echo "﹣ grade-outcome runs vitest (0.01ms) # no .eval-cache/node26 (run prepare.mjs)"
echo "ℹ tests 3"
echo "ℹ pass 1"
echo "ℹ fail 0"
echo "ℹ skipped 2"
exit 0
