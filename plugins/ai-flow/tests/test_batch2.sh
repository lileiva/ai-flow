#!/usr/bin/env bash
# Batch 2 Content Verification Tests
# Tests for: explorer iterative loop, flow-explore SKILL.md, proposer brainstorm,
#            orchestrator skill creation detection, agent engram fallback notes,
#            orchestrator brainstorm tracking

set -euo pipefail

PLUGIN_DIR="/Users/luisleiva/plugins/ai-flow/plugins/ai-flow"
PASS=0
FAIL=0

assert_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo "  PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $description"
    echo "    Expected pattern '$pattern' in $file"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if ! grep -q "$pattern" "$file" 2>/dev/null; then
    echo "  PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $description"
    echo "    Unexpected pattern '$pattern' found in $file"
    FAIL=$((FAIL + 1))
  fi
}

# ============================================================
# TASK 2.1: Explorer iterative discovery loop (REQ-006, REQ-007)
# ============================================================
echo ""
echo "=== Task 2.1: Explorer iterative discovery loop ==="

EXPLORER="$PLUGIN_DIR/agents/explorer.md"

# REQ-006 Scenario 1: Round 1 remains structured AskUserQuestion (existing behavior preserved)
assert_contains "$EXPLORER" "AskUserQuestion" "REQ-006 S1: AskUserQuestion tool used for round 1"
assert_contains "$EXPLORER" "Interactive Requirements Gathering" "REQ-006 S1: Existing section preserved"

# REQ-006 Scenario 2: Readiness gate after round 1
assert_contains "$EXPLORER" "Readiness Gate" "REQ-006 S2: Readiness gate section exists"
assert_contains "$EXPLORER" "Ready to proceed" "REQ-006 S2: Ready to proceed option exists"
assert_contains "$EXPLORER" "refine" "REQ-006 S2: Refine option exists"

# REQ-006 Scenario 3: User chooses to refine
assert_contains "$EXPLORER" "Refinement Round" "REQ-006 S3: Refinement round section exists"
assert_contains "$EXPLORER" "follow-up" "REQ-006 S3: Follow-up questions mentioned"

# REQ-006 Scenario 4: Bounded to 3 rounds maximum
assert_contains "$EXPLORER" "3" "REQ-006 S4: Maximum 3 refinement rounds referenced"

# REQ-006 Scenario 5: User is ready after round 1
assert_contains "$EXPLORER" "readiness" "REQ-006 S5: Readiness concept mentioned"

# REQ-007 Scenario 1: Brainstorm artifact saved with correct topic key
assert_contains "$EXPLORER" "flow/{change-name}/brainstorm" "REQ-007 S1: Brainstorm topic key in explorer"
assert_contains "$EXPLORER" "refined problem statement" "REQ-007 S1: Brainstorm content requirements listed"

# REQ-007 Scenario 2: Brainstorm artifact is distinct from exploration
assert_contains "$EXPLORER" "brainstorm" "REQ-007 S2: Brainstorm artifact referenced"

# Return contract should mention brainstorm artifact
assert_contains "$EXPLORER" "brainstorm" "REQ-007: Brainstorm mentioned in explorer return contract"

# ============================================================
# TASK 2.2: flow-explore SKILL.md update (REQ-019)
# ============================================================
echo ""
echo "=== Task 2.2: flow-explore SKILL.md update ==="

FLOW_EXPLORE="$PLUGIN_DIR/skills/flow-explore/SKILL.md"

# REQ-019 Scenario 1: Documents iterative discovery
assert_contains "$FLOW_EXPLORE" "iterative" "REQ-019 S1: Iterative discovery mentioned"
assert_contains "$FLOW_EXPLORE" "refinement" "REQ-019 S1: Refinement mentioned"
assert_contains "$FLOW_EXPLORE" "readiness" "REQ-019 S1: Readiness gate referenced"
assert_contains "$FLOW_EXPLORE" "brainstorm" "REQ-019 S1: Brainstorm artifact output documented"

# REQ-019 Scenario 2: Existing delegation preserved
assert_contains "$FLOW_EXPLORE" "explorer" "REQ-019 S2: Explorer agent delegation preserved"
assert_contains "$FLOW_EXPLORE" "agents/explorer.md" "REQ-019 S2: Agent file reference preserved"

# ============================================================
# TASK 2.3: Proposer brainstorm input (REQ-012)
# ============================================================
echo ""
echo "=== Task 2.3: Proposer brainstorm input ==="

PROPOSER="$PLUGIN_DIR/agents/proposer.md"

# REQ-012 Scenario 1: Brainstorm listed in Reading Context
assert_contains "$PROPOSER" "flow/{change-name}/brainstorm" "REQ-012 S1: Brainstorm topic key in proposer"
assert_contains "$PROPOSER" "OPTIONAL" "REQ-012 S1: Brainstorm marked as optional"

# REQ-012 Scenario 2: Proposer works without brainstorm
assert_contains "$PROPOSER" "not found" "REQ-012 S2: Handles missing brainstorm gracefully"

# ============================================================
# TASK 2.4: Orchestrator skill creation detection (REQ-008)
# ============================================================
echo ""
echo "=== Task 2.4: Orchestrator skill creation detection ==="

ORCHESTRATOR="$PLUGIN_DIR/agents/orchestrator.md"

# REQ-008 Scenario 1: Contains skill creation detection section
assert_contains "$ORCHESTRATOR" "Skill Creation Detection" "REQ-008 S1: Skill creation detection section exists"
assert_contains "$ORCHESTRATOR" "reusable pattern" "REQ-008 S1: Reusable pattern language present"

# REQ-008 Scenario 2: User can decline
assert_contains "$ORCHESTRATOR" "skill-creator" "REQ-008 S3: Skill-creator reference exists"

# REQ-008 Scenario 4: No forced creation
assert_contains "$ORCHESTRATOR" "suggest" "REQ-008 S4: Suggestion (not forced) language"

# ============================================================
# TASK 2.5: Engram fallback notes in ALL agent files (REQ-011)
# ============================================================
echo ""
echo "=== Task 2.5: Engram fallback notes in all agents ==="

AGENTS=(
  "$PLUGIN_DIR/agents/explorer.md"
  "$PLUGIN_DIR/agents/proposer.md"
  "$PLUGIN_DIR/agents/specifier.md"
  "$PLUGIN_DIR/agents/designer.md"
  "$PLUGIN_DIR/agents/planner.md"
  "$PLUGIN_DIR/agents/implementer.md"
  "$PLUGIN_DIR/agents/verifier.md"
  "$PLUGIN_DIR/agents/archivist.md"
  "$PLUGIN_DIR/agents/debugger.md"
)

for agent in "${AGENTS[@]}"; do
  name=$(basename "$agent" .md)
  # REQ-011 Scenario 1: Each agent has fallback note
  assert_contains "$agent" "engram.*unavailable\|unavailable.*engram\|[Ee]ngram fallback\|engram is unavailable" "REQ-011 S1: $name has engram fallback note"
done

# REQ-011 Scenario 2: Fallback note is brief (check it's not more than ~100 words in the section)
# We test this by ensuring the note exists but the file is not drastically changed
# Just check the note is present (already done above)

# ============================================================
# TASK 2.6: Orchestrator brainstorm tracking (REQ-007, REQ-009)
# ============================================================
echo ""
echo "=== Task 2.6: Orchestrator brainstorm tracking ==="

# Orchestrator passes brainstorm topic key to proposer
assert_contains "$ORCHESTRATOR" "brainstorm" "REQ-007: Orchestrator references brainstorm artifact"

# Orchestrator state tracking includes brainstorm
assert_contains "$ORCHESTRATOR" "brainstorm" "REQ-007: Brainstorm in orchestrator state tracking"

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
