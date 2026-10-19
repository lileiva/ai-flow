#!/usr/bin/env bash
# Single entry point for the ai-flow eval suite. See plugins/ai-flow/evals/README.md.
exec node "$(dirname "$0")/tooling/run.mjs" "$@"
