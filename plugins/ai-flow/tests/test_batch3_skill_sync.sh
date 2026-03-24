#!/usr/bin/env bash
# Tests for Batch 3: Skill-sync infrastructure and metadata frontmatter
# Covers REQ-014 (Scenarios 1-5), REQ-015 (Scenarios 1-2)

set -e

PLUGIN_ROOT="/Users/luisleiva/plugins/ai-flow/plugins/ai-flow"
PASS=0
FAIL=0

assert() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Task 3.1: skill-sync SKILL.md (REQ-014 Scenario 1) ==="

# REQ-014 Scenario 1: skill-sync SKILL.md documents the process
SKILL_SYNC="$PLUGIN_ROOT/skills/skill-sync/SKILL.md"
assert "skill-sync SKILL.md exists" "$([ -f "$SKILL_SYNC" ] && echo true || echo false)"
assert "documents purpose" "$(grep -q 'Purpose\|purpose' "$SKILL_SYNC" 2>/dev/null && echo true || echo false)"
assert "documents output format (scope-based rules)" "$(grep -q 'rules.*agents\|{scope}-agents' "$SKILL_SYNC" 2>/dev/null && echo true || echo false)"
assert "documents required metadata fields (scope)" "$(grep -q 'metadata.scope\|metadata\.scope\|scope' "$SKILL_SYNC" 2>/dev/null && echo true || echo false)"
assert "documents required metadata fields (auto_invoke)" "$(grep -q 'auto_invoke' "$SKILL_SYNC" 2>/dev/null && echo true || echo false)"
assert "documents usage commands" "$(grep -q 'sync.sh\|scripts/sync' "$SKILL_SYNC" 2>/dev/null && echo true || echo false)"
assert "has frontmatter with name field" "$(grep -q '^name: skill-sync' "$SKILL_SYNC" 2>/dev/null && echo true || echo false)"
assert "has metadata.scope in frontmatter" "$(grep -q 'scope:.*root' "$SKILL_SYNC" 2>/dev/null && echo true || echo false)"
assert "has metadata.auto_invoke in frontmatter" "$(grep -q 'auto_invoke:' "$SKILL_SYNC" 2>/dev/null && echo true || echo false)"

echo ""
echo "=== Task 3.2: sync.sh canonical script (REQ-014 Scenarios 2-5) ==="

SYNC_SCRIPT="$PLUGIN_ROOT/skills/skill-sync/assets/sync.sh"
assert "sync.sh canonical script exists" "$([ -f "$SYNC_SCRIPT" ] && echo true || echo false)"
assert "sync.sh is executable" "$([ -x "$SYNC_SCRIPT" ] && echo true || echo false)"

# REQ-014 Scenario 2: Script runs without error in dry-run
SYNC_OUTPUT=$(CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$SYNC_SCRIPT" --dry-run 2>&1) || true
assert "sync.sh --dry-run runs without error" "$(CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$SYNC_SCRIPT" --dry-run >/dev/null 2>&1 && echo true || echo false)"
assert "dry-run output mentions Available Skills" "$(echo "$SYNC_OUTPUT" | grep -q 'Available Skills' && echo true || echo false)"
assert "dry-run output mentions Auto-invoke" "$(echo "$SYNC_OUTPUT" | grep -q 'Auto-invoke' && echo true || echo false)"

# REQ-014 Scenario 4: --scope flag
SCOPE_OUTPUT=$(CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$SYNC_SCRIPT" --dry-run --scope root 2>&1) || true
assert "sync.sh --scope root runs without error" "$(CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$SYNC_SCRIPT" --dry-run --scope root >/dev/null 2>&1 && echo true || echo false)"
assert "--scope root output mentions root" "$(echo "$SCOPE_OUTPUT" | grep -q 'root' && echo true || echo false)"

echo ""
echo "=== Task 3.3: sync wrapper script (REQ-014 Scenario 3) ==="

WRAPPER="$PLUGIN_ROOT/scripts/sync.sh"
assert "scripts/sync.sh wrapper exists" "$([ -f "$WRAPPER" ] && echo true || echo false)"
assert "wrapper is executable" "$([ -x "$WRAPPER" ] && echo true || echo false)"

# REQ-014 Scenario 3: Wrapper delegates to canonical script
WRAPPER_OUTPUT=$(CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$WRAPPER" --dry-run 2>&1) || true
assert "wrapper --dry-run produces output" "$([ -n "$WRAPPER_OUTPUT" ] && echo true || echo false)"
assert "wrapper output matches canonical output" "$([ "$WRAPPER_OUTPUT" = "$SYNC_OUTPUT" ] && echo true || echo false)"

echo ""
echo "=== Task 3.4: Metadata frontmatter on ALL skill SKILL.md files (REQ-015) ==="

SKILLS=(
  flow-explore flow-propose flow-spec flow-design flow-plan
  flow-apply flow-verify flow-archive flow-debug flow-init
  using-ai-flow skill-sync
)

for skill in "${SKILLS[@]}"; do
  SKILL_FILE="$PLUGIN_ROOT/skills/$skill/SKILL.md"
  assert "$skill SKILL.md exists" "$([ -f "$SKILL_FILE" ] && echo true || echo false)"
  # REQ-015 Scenario 1: metadata.scope present
  assert "$skill has metadata.scope" "$(awk '/^---$/{n++; next} n==1 && /scope:/{found=1} n==2{exit} END{print (found?"true":"false")}' "$SKILL_FILE" 2>/dev/null)"
  # REQ-015 Scenario 1: metadata.auto_invoke present
  assert "$skill has metadata.auto_invoke" "$(awk '/^---$/{n++; next} n==1 && /auto_invoke:/{found=1} n==2{exit} END{print (found?"true":"false")}' "$SKILL_FILE" 2>/dev/null)"
done

# REQ-015 Scenario 2: Existing frontmatter preserved
assert "flow-explore preserves name field" "$(grep -q '^name: flow-explore' "$PLUGIN_ROOT/skills/flow-explore/SKILL.md" 2>/dev/null && echo true || echo false)"
assert "flow-explore preserves description" "$(grep -q 'description:' "$PLUGIN_ROOT/skills/flow-explore/SKILL.md" 2>/dev/null && echo true || echo false)"

echo ""
echo "=== Summary ==="
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ] && echo "ALL TESTS PASSED" || echo "SOME TESTS FAILED"
exit $FAIL
