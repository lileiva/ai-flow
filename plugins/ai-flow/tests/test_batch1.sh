#!/usr/bin/env bash
# Test suite for Batch 1 tasks
# Each test function returns 0 on pass, 1 on fail

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0
ERRORS=()

assert_contains() {
  local file="$1" pattern="$2" description="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    return 0
  else
    return 1
  fi
}

run_test() {
  local name="$1"
  shift
  if "$@"; then
    PASS=$((PASS + 1))
    echo "  PASS: $name"
  else
    FAIL=$((FAIL + 1))
    ERRORS+=("$name")
    echo "  FAIL: $name"
  fi
}

# ===========================================================
# Task 1.1: using-ai-flow bootstrapper skill (REQ-010)
# ===========================================================
echo "--- Task 1.1: using-ai-flow bootstrapper skill (REQ-010) ---"

SKILL_FILE="${PLUGIN_ROOT}/skills/using-ai-flow/SKILL.md"

# REQ-010 Scenario 1: Contains all required sections
test_skill_has_instruction_priority() {
  assert_contains "$SKILL_FILE" "Instruction Priority" "instruction priority section"
}
run_test "REQ-010-S1: instruction priority section" test_skill_has_instruction_priority

test_skill_has_flow_commands() {
  assert_contains "$SKILL_FILE" "Flow Commands" "flow commands table"
}
run_test "REQ-010-S1: flow commands table" test_skill_has_flow_commands

test_skill_has_command_agent_mapping() {
  assert_contains "$SKILL_FILE" "Command.*Agent.*Mapping\|Agent.*Mapping\|Command.*Skill.*Mapping" "command-to-agent mapping"
}
run_test "REQ-010-S1: command-to-agent mapping" test_skill_has_command_agent_mapping

test_skill_has_dependency_graph() {
  assert_contains "$SKILL_FILE" "Dependency Graph" "dependency graph"
}
run_test "REQ-010-S1: dependency graph" test_skill_has_dependency_graph

test_skill_has_auto_invoke() {
  assert_contains "$SKILL_FILE" "Auto-invoke" "auto-invoke rules"
}
run_test "REQ-010-S1: auto-invoke rules" test_skill_has_auto_invoke

test_skill_has_orchestrator_rules() {
  assert_contains "$SKILL_FILE" "Orchestrator Rules\|orchestrator.*coordinate\|Delegate-only" "orchestrator rules"
}
run_test "REQ-010-S1: orchestrator behavioral rules" test_skill_has_orchestrator_rules

test_skill_has_peer_dependencies() {
  assert_contains "$SKILL_FILE" "Peer Dependencies" "peer dependencies"
}
run_test "REQ-010-S1: peer dependencies section" test_skill_has_peer_dependencies

# REQ-010 Scenario 2: SUBAGENT-STOP guard
test_skill_has_subagent_stop() {
  assert_contains "$SKILL_FILE" "SUBAGENT-STOP" "SUBAGENT-STOP guard"
}
run_test "REQ-010-S2: SUBAGENT-STOP guard present" test_skill_has_subagent_stop

# REQ-010 Scenario 3: Cross-references orchestrator
test_skill_references_orchestrator() {
  assert_contains "$SKILL_FILE" "agents/orchestrator.md" "orchestrator cross-reference"
}
run_test "REQ-010-S3: cross-references orchestrator" test_skill_references_orchestrator

# REQ-010: metadata frontmatter with scope and auto_invoke
test_skill_has_metadata_scope() {
  assert_contains "$SKILL_FILE" "scope:" "metadata scope field"
}
run_test "REQ-010: metadata scope field" test_skill_has_metadata_scope

test_skill_has_metadata_auto_invoke() {
  assert_contains "$SKILL_FILE" "auto_invoke:" "metadata auto_invoke field"
}
run_test "REQ-010: metadata auto_invoke field" test_skill_has_metadata_auto_invoke

# ===========================================================
# Task 1.2: hooks.json (REQ-005)
# ===========================================================
echo ""
echo "--- Task 1.2: hooks.json (REQ-005) ---"

HOOKS_JSON="${PLUGIN_ROOT}/hooks/hooks.json"

# REQ-005 Scenario 1: Valid JSON with SessionStart registration
test_hooks_json_valid() {
  python3 -m json.tool < "$HOOKS_JSON" > /dev/null 2>&1
}
run_test "REQ-005-S1: hooks.json is valid JSON" test_hooks_json_valid

test_hooks_json_has_session_start() {
  python3 -c "
import json, sys
with open('$HOOKS_JSON') as f:
    data = json.load(f)
hooks = data.get('hooks', {}).get('SessionStart', [])
assert len(hooks) > 0, 'No SessionStart hooks'
entry = hooks[0]
assert 'startup|resume|clear|compact' in entry.get('matcher', ''), 'Wrong matcher'
cmds = entry.get('hooks', [])
assert len(cmds) > 0, 'No hook commands'
assert 'run-hook.cmd' in cmds[0].get('command', ''), 'Command missing run-hook.cmd'
assert 'session-start' in cmds[0].get('command', ''), 'Command missing session-start'
" 2>&1
}
run_test "REQ-005-S1: SessionStart registration correct" test_hooks_json_has_session_start

# REQ-005 Scenario 2: Backward-compatible structure
test_hooks_json_no_error() {
  python3 -c "
import json
with open('$HOOKS_JSON') as f:
    data = json.load(f)
assert 'hooks' in data, 'Missing hooks key'
" 2>&1
}
run_test "REQ-005-S2: backward-compatible structure" test_hooks_json_no_error

# ===========================================================
# Task 1.3: run-hook.cmd (REQ-004)
# ===========================================================
echo ""
echo "--- Task 1.3: run-hook.cmd (REQ-004) ---"

RUN_HOOK="${PLUGIN_ROOT}/hooks/run-hook.cmd"

# REQ-004: File exists
test_run_hook_exists() {
  [ -f "$RUN_HOOK" ]
}
run_test "REQ-004: run-hook.cmd file exists" test_run_hook_exists

# REQ-004: Contains polyglot structure (both CMD and bash sections)
test_run_hook_has_cmd_block() {
  assert_contains "$RUN_HOOK" "CMDBLOCK" "CMD block marker"
}
run_test "REQ-004: has CMD block (Windows support)" test_run_hook_has_cmd_block

test_run_hook_has_unix_section() {
  assert_contains "$RUN_HOOK" "exec bash" "Unix exec bash"
}
run_test "REQ-004: has Unix exec bash section" test_run_hook_has_unix_section

# REQ-004: Contains Git Bash Windows detection
test_run_hook_has_git_bash() {
  assert_contains "$RUN_HOOK" "Git.*bash\|bash.exe" "Git Bash detection"
}
run_test "REQ-004: has Git Bash detection" test_run_hook_has_git_bash

# REQ-004 Scenario 1: Unix delegation produces same output
test_run_hook_unix_delegation() {
  local direct_output hook_output
  direct_output=$(CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "${PLUGIN_ROOT}/hooks/session-start" 2>/dev/null || true)
  hook_output=$(CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$RUN_HOOK" session-start 2>/dev/null || true)
  [ "$direct_output" = "$hook_output" ]
}
run_test "REQ-004-S1: Unix delegation matches direct execution" test_run_hook_unix_delegation

# ===========================================================
# Task 1.4: Persistence contract none fallback (REQ-009)
# ===========================================================
echo ""
echo "--- Task 1.4: persistence-contract.md none fallback (REQ-009) ---"

PERSISTENCE="${PLUGIN_ROOT}/skills/_shared/persistence-contract.md"

# REQ-009: Has fallback mode section
test_persistence_has_none_mode() {
  assert_contains "$PERSISTENCE" "Fallback Mode.*none\|none.*mode\|none.*fallback" "none fallback section"
}
run_test "REQ-009: has none fallback mode section" test_persistence_has_none_mode

# REQ-009 Scenario 3: Documents inline-only behavior
test_persistence_inline_behavior() {
  assert_contains "$PERSISTENCE" "inline" "inline artifact passing"
}
run_test "REQ-009-S3: documents inline-only behavior" test_persistence_inline_behavior

# REQ-009 Scenario 4: Recommends engram installation
test_persistence_recommends_engram() {
  assert_contains "$PERSISTENCE" "install.*engram\|recommend.*engram\|engram.*install" "engram installation recommendation"
}
run_test "REQ-009-S4: recommends engram installation" test_persistence_recommends_engram

# REQ-009: Does not remove existing engram-focused protocol
test_persistence_keeps_existing() {
  assert_contains "$PERSISTENCE" "Artifact Store Mode" "existing Artifact Store Mode section"
}
run_test "REQ-009: existing protocol preserved" test_persistence_keeps_existing

# REQ-009: Documents mem_save/mem_search skip
test_persistence_skip_mem_calls() {
  assert_contains "$PERSISTENCE" "mem_save\|mem_search\|mem_get" "mem call skip instructions"
}
run_test "REQ-009: documents skipping mem calls" test_persistence_skip_mem_calls

# REQ-009: Documents multi-session limitation
test_persistence_multi_session_warning() {
  assert_contains "$PERSISTENCE" "multi-session\|session.*lost\|conversation.*ends" "multi-session warning"
}
run_test "REQ-009: warns about multi-session limitation" test_persistence_multi_session_warning

# ===========================================================
# Task 1.5: engram-convention.md brainstorm row (REQ-018)
# ===========================================================
echo ""
echo "--- Task 1.5: engram-convention.md brainstorm row (REQ-018) ---"

ENGRAM_CONV="${PLUGIN_ROOT}/skills/_shared/engram-convention.md"

# REQ-018 Scenario 1: Brainstorm row exists
test_engram_has_brainstorm() {
  assert_contains "$ENGRAM_CONV" "Brainstorm\|brainstorm" "brainstorm row in naming table"
}
run_test "REQ-018-S1: brainstorm row in naming table" test_engram_has_brainstorm

# REQ-018 Scenario 1: Correct topic key pattern
test_engram_brainstorm_topic_key() {
  assert_contains "$ENGRAM_CONV" "flow/{change-name}/brainstorm" "brainstorm topic key pattern"
}
run_test "REQ-018-S1: brainstorm topic key pattern" test_engram_brainstorm_topic_key

# REQ-018 Scenario 1: Has example
test_engram_brainstorm_example() {
  assert_contains "$ENGRAM_CONV" "flow/auth-system/brainstorm" "brainstorm example"
}
run_test "REQ-018-S1: brainstorm example" test_engram_brainstorm_example

# REQ-018 Scenario 2: Existing rows unchanged
test_engram_existing_rows() {
  local existing_rows=("Project context" "Exploration" "Proposal" "Spec" "Design" "Plan" "Apply progress" "Verify report" "Archive report" "DAG state")
  for row in "${existing_rows[@]}"; do
    if ! assert_contains "$ENGRAM_CONV" "$row" "$row row"; then
      return 1
    fi
  done
  return 0
}
run_test "REQ-018-S2: all existing rows unchanged" test_engram_existing_rows

# ===========================================================
# Summary
# ===========================================================
echo ""
echo "==========================================="
echo "Results: $PASS passed, $FAIL failed"
echo "==========================================="
if [ ${#ERRORS[@]} -gt 0 ]; then
  echo "Failures:"
  for err in "${ERRORS[@]}"; do
    echo "  - $err"
  done
fi
exit $FAIL
