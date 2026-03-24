#!/usr/bin/env bash
# Batch 4 tests: Layer 2 Ecosystem
# Tests for Tasks 4.1, 4.2, 4.3, 4.4

set -euo pipefail

PLUGIN_ROOT="/Users/luisleiva/plugins/ai-flow/plugins/ai-flow"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; ((PASS++)); }
fail() { echo "  FAIL: $1"; ((FAIL++)); }

echo "=== Task 4.1: Conditional Superpowers References ==="

# REQ-013 Scenario 1: Implementer references superpowers:test-driven-development
echo "--- REQ-013 Scenario 1: Implementer superpowers ---"
if grep -q "superpowers:test-driven-development" "$PLUGIN_ROOT/agents/implementer.md"; then
  pass "implementer.md references superpowers:test-driven-development"
else
  fail "implementer.md missing superpowers:test-driven-development reference"
fi
if grep -q "Ecosystem Enhancement" "$PLUGIN_ROOT/agents/implementer.md"; then
  pass "implementer.md has Ecosystem Enhancement section"
else
  fail "implementer.md missing Ecosystem Enhancement section"
fi

# REQ-013 Scenario 2: Debugger references superpowers:systematic-debugging
echo "--- REQ-013 Scenario 2: Debugger superpowers ---"
if grep -q "superpowers:systematic-debugging" "$PLUGIN_ROOT/agents/debugger.md"; then
  pass "debugger.md references superpowers:systematic-debugging"
else
  fail "debugger.md missing superpowers:systematic-debugging reference"
fi
if grep -q "Ecosystem Enhancement" "$PLUGIN_ROOT/agents/debugger.md"; then
  pass "debugger.md has Ecosystem Enhancement section"
else
  fail "debugger.md missing Ecosystem Enhancement section"
fi

# REQ-013 Scenario 3: Verifier references superpowers:verification-before-completion
echo "--- REQ-013 Scenario 3: Verifier superpowers ---"
if grep -q "superpowers:verification-before-completion" "$PLUGIN_ROOT/agents/verifier.md"; then
  pass "verifier.md references superpowers:verification-before-completion"
else
  fail "verifier.md missing superpowers:verification-before-completion reference"
fi
if grep -q "Ecosystem Enhancement" "$PLUGIN_ROOT/agents/verifier.md"; then
  pass "verifier.md has Ecosystem Enhancement section"
else
  fail "verifier.md missing Ecosystem Enhancement section"
fi

# REQ-013 Scenario 4: Explorer references superpowers:brainstorming
echo "--- REQ-013 Scenario 4: Explorer superpowers ---"
if grep -q "superpowers:brainstorming" "$PLUGIN_ROOT/agents/explorer.md"; then
  pass "explorer.md references superpowers:brainstorming"
else
  fail "explorer.md missing superpowers:brainstorming reference"
fi
if grep -q "Ecosystem Enhancement" "$PLUGIN_ROOT/agents/explorer.md"; then
  pass "explorer.md has Ecosystem Enhancement section"
else
  fail "explorer.md missing Ecosystem Enhancement section"
fi

# REQ-013 Scenario 5: Orchestrator references dispatching and batching superpowers
echo "--- REQ-013 Scenario 5: Orchestrator superpowers ---"
if grep -q "superpowers:dispatching-parallel-agents" "$PLUGIN_ROOT/agents/orchestrator.md"; then
  pass "orchestrator.md references superpowers:dispatching-parallel-agents"
else
  fail "orchestrator.md missing superpowers:dispatching-parallel-agents reference"
fi
if grep -q "Ecosystem Enhancement" "$PLUGIN_ROOT/agents/orchestrator.md"; then
  pass "orchestrator.md has Ecosystem Enhancement section"
else
  fail "orchestrator.md missing Ecosystem Enhancement section"
fi

# REQ-013 Scenario 6: Built-in protocols NOT removed (check existing protocol text remains)
echo "--- REQ-013 Scenario 6: Built-in protocols preserved ---"
if grep -q "tdd-protocol.md" "$PLUGIN_ROOT/agents/implementer.md"; then
  pass "implementer.md still references tdd-protocol.md (built-in)"
else
  fail "implementer.md lost tdd-protocol.md reference (built-in protocol removed!)"
fi
if grep -q "Root Cause Investigation" "$PLUGIN_ROOT/agents/debugger.md"; then
  pass "debugger.md still has Root Cause Investigation (built-in)"
else
  fail "debugger.md lost Root Cause Investigation (built-in protocol removed!)"
fi
if grep -q "Iron Law" "$PLUGIN_ROOT/agents/verifier.md"; then
  pass "verifier.md still has Iron Law (built-in)"
else
  fail "verifier.md lost Iron Law (built-in protocol removed!)"
fi
if grep -q "AskUserQuestion" "$PLUGIN_ROOT/agents/explorer.md"; then
  pass "explorer.md still has AskUserQuestion (built-in)"
else
  fail "explorer.md lost AskUserQuestion (built-in protocol removed!)"
fi

# REQ-013: Each Ecosystem Enhancement section has "Otherwise" fallback clause (E12 from design)
echo "--- REQ-013: Fallback clauses in Ecosystem Enhancement ---"
for agent in explorer implementer debugger verifier orchestrator; do
  if grep -A5 "Ecosystem Enhancement" "$PLUGIN_ROOT/agents/${agent}.md" | grep -qi "otherwise\|not installed\|not available\|self-sufficient"; then
    pass "${agent}.md Ecosystem Enhancement has fallback clause"
  else
    fail "${agent}.md Ecosystem Enhancement missing fallback clause"
  fi
done

echo ""
echo "=== Task 4.2: Identity Inheritance in Orchestrator ==="

# REQ-016 Scenario 1: Identity Inheritance section exists
echo "--- REQ-016 Scenario 1: Identity Inheritance section ---"
if grep -q "Identity Inheritance" "$PLUGIN_ROOT/agents/orchestrator.md"; then
  pass "orchestrator.md has Identity Inheritance section"
else
  fail "orchestrator.md missing Identity Inheritance section"
fi

# REQ-016 Scenario 1: Mentions AGENTS.md
if grep -q "AGENTS.md" "$PLUGIN_ROOT/agents/orchestrator.md"; then
  pass "orchestrator.md mentions AGENTS.md"
else
  fail "orchestrator.md does not mention AGENTS.md"
fi

# REQ-016 Scenario 2: Works without AGENTS.md (advisory, no error)
if grep -A5 "Identity Inheritance" "$PLUGIN_ROOT/agents/orchestrator.md" | grep -qi "if.*exists\|if one exists\|if present"; then
  pass "Identity Inheritance is conditional (works without AGENTS.md)"
else
  fail "Identity Inheritance is not conditional on AGENTS.md existence"
fi

# REQ-016 Scenario 3: Identity is overlay, not replacement
if grep -A10 "Identity Inheritance" "$PLUGIN_ROOT/agents/orchestrator.md" | grep -qi "overlay\|on top of\|in addition\|complement"; then
  pass "Identity is overlay, not replacement"
else
  fail "Identity Inheritance does not describe overlay behavior"
fi

echo ""
echo "=== Task 4.3: Git Worktree Suggestion in Orchestrator ==="

# REQ-017 Scenario 1: Worktree suggestion appears
echo "--- REQ-017 Scenario 1: Worktree suggestion ---"
if grep -q "worktree" "$PLUGIN_ROOT/agents/orchestrator.md"; then
  pass "orchestrator.md mentions worktree"
else
  fail "orchestrator.md does not mention worktree"
fi

# REQ-017 Scenario 2: References superpowers:using-git-worktrees
if grep -q "superpowers:using-git-worktrees" "$PLUGIN_ROOT/agents/orchestrator.md"; then
  pass "orchestrator.md references superpowers:using-git-worktrees"
else
  fail "orchestrator.md missing superpowers:using-git-worktrees reference"
fi

# REQ-017 Scenario 3: Fallback git worktree command
if grep -q "git worktree add" "$PLUGIN_ROOT/agents/orchestrator.md"; then
  pass "orchestrator.md has fallback git worktree add command"
else
  fail "orchestrator.md missing fallback git worktree add command"
fi

# REQ-017 Scenario 4: Worktree is optional (never required)
if grep -A5 "worktree" "$PLUGIN_ROOT/agents/orchestrator.md" | grep -qi "optional\|suggest\|never required\|if available\|consider"; then
  pass "Worktree suggestion is optional"
else
  fail "Worktree suggestion does not indicate it is optional"
fi

echo ""
echo "=== Task 4.4: Validate Sync Metadata ==="

# REQ-014/REQ-015: All 12 skill files have metadata.scope and metadata.auto_invoke
echo "--- REQ-015: All skills have metadata frontmatter ---"
SKILL_COUNT=0
SCOPE_COUNT=0
AUTO_INVOKE_COUNT=0
for skill_file in "$PLUGIN_ROOT"/skills/*/SKILL.md; do
  ((SKILL_COUNT++))
  skill_name=$(basename "$(dirname "$skill_file")")
  # Check for scope in frontmatter (between --- markers)
  if awk '/^---$/{n++; next} n==1{print}' "$skill_file" | grep -q "scope:"; then
    ((SCOPE_COUNT++))
  else
    fail "Skill $skill_name missing metadata.scope"
  fi
  # Check for auto_invoke in frontmatter
  if awk '/^---$/{n++; next} n==1{print}' "$skill_file" | grep -q "auto_invoke:"; then
    ((AUTO_INVOKE_COUNT++))
  else
    fail "Skill $skill_name missing metadata.auto_invoke"
  fi
done

echo "  Total skills: $SKILL_COUNT"
if [ "$SCOPE_COUNT" -eq "$SKILL_COUNT" ]; then
  pass "All $SKILL_COUNT skills have metadata.scope"
else
  fail "Only $SCOPE_COUNT/$SKILL_COUNT skills have metadata.scope"
fi
if [ "$AUTO_INVOKE_COUNT" -eq "$SKILL_COUNT" ]; then
  pass "All $SKILL_COUNT skills have metadata.auto_invoke"
else
  fail "Only $AUTO_INVOKE_COUNT/$SKILL_COUNT skills have metadata.auto_invoke"
fi

# Verify skill count is at least 12
if [ "$SKILL_COUNT" -ge 12 ]; then
  pass "Skill count is $SKILL_COUNT (expected >= 12)"
else
  fail "Skill count is $SKILL_COUNT (expected >= 12)"
fi

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
