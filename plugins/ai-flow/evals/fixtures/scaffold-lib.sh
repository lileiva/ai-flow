#!/usr/bin/env bash
# Shared scaffold library for the ai-flow eval cases (REQ-002, design D4).
# Usage (from a case's scaffold.sh):  source ".../fixtures/scaffold-lib.sh"; scaffold_textkit <overlay-dir|->
# Runs outside the agent sandbox, in the empty run workspace, with HOME set to the run's temp home.

_aiflow_fail() { echo "scaffold-lib: $*" >&2; exit 1; }

# Walk up from this library to the plugin root (the dir holding .claude-plugin/plugin.json).
_aiflow_plugin_root() {
  local dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  while [ "$dir" != "/" ]; do
    [ -f "$dir/.claude-plugin/plugin.json" ] && { echo "$dir"; return 0; }
    dir="$(dirname "$dir")"
  done
  return 1
}

# Copy a tree preferring an APFS clone.
_aiflow_clone() { cp -cR "$1" "$2" 2>/dev/null || cp -R "$1" "$2"; }

scaffold_textkit() {
  local overlay="${1:--}" plugin cache template
  plugin="$(_aiflow_plugin_root)" || _aiflow_fail "cannot locate plugin root above ${BASH_SOURCE[0]}"
  cache="${AIFLOW_EVAL_CACHE_DIR:-$plugin/../../.eval-cache}"
  template="$plugin/evals/fixtures/textkit"
  [ -d "$cache/textkit/node_modules" ] || _aiflow_fail "eval cache missing at $cache/textkit/node_modules; run: node plugins/ai-flow/evals/tooling/prepare.mjs"

  cp -R "$template/." .
  _aiflow_clone "$cache/textkit/node_modules" ./node_modules
  if [ "$overlay" != "-" ]; then
    [ -d "$overlay" ] || _aiflow_fail "overlay dir not found: $overlay"
    cp -R "$overlay/." .
  fi
  printf 'node_modules/\n' > .gitignore

  # Deterministic history: fixed identity and dates, no user/global git config (HOME is temp).
  export GIT_AUTHOR_NAME="AI-Flow Eval" GIT_AUTHOR_EMAIL="eval@ai-flow.invalid" GIT_AUTHOR_DATE="2026-01-01T00:00:00Z"
  export GIT_COMMITTER_NAME="AI-Flow Eval" GIT_COMMITTER_EMAIL="eval@ai-flow.invalid" GIT_COMMITTER_DATE="2026-01-01T00:00:00Z"
  git init -q -b main .
  git -c commit.gpgsign=false add -A
  git -c commit.gpgsign=false commit -q -m "textkit: initial import"
}
