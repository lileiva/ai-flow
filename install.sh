#!/usr/bin/env bash
set -euo pipefail

# AI-Flow Installer
# Installs skills and orchestrator config for Claude Code

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_SRC="$SCRIPT_DIR/skills"
SKILLS_DEST="$HOME/.claude/skills"
CLAUDE_MD="$HOME/.claude/CLAUDE.md"

echo "=== AI-Flow Installer ==="
echo ""

# 1. Install skills
echo "[1/3] Installing skills to $SKILLS_DEST ..."

for skill_dir in "$SKILLS_SRC"/flow-*/; do
  skill_name="$(basename "$skill_dir")"
  dest_dir="$SKILLS_DEST/$skill_name"
  mkdir -p "$dest_dir"
  cp "$skill_dir/SKILL.md" "$dest_dir/SKILL.md"
  echo "  + $skill_name"
done

# 2. Install shared conventions
echo "[2/3] Installing shared conventions ..."

mkdir -p "$SKILLS_DEST/_shared"
cp "$SKILLS_SRC/_shared/"*.md "$SKILLS_DEST/_shared/"
echo "  + _shared/engram-convention.md"
echo "  + _shared/persistence-contract.md"
echo "  + _shared/tdd-protocol.md"

# 3. Append orchestrator instructions to CLAUDE.md
echo "[3/3] Configuring orchestrator ..."

MARKER="# AI-Flow Orchestrator Instructions"

if [ -f "$CLAUDE_MD" ] && grep -q "$MARKER" "$CLAUDE_MD"; then
  echo "  Orchestrator config already present in CLAUDE.md — skipping."
  echo "  To update, remove the AI-Flow section from $CLAUDE_MD and re-run."
else
  echo "" >> "$CLAUDE_MD"
  cat "$SKILLS_SRC/CLAUDE.md" >> "$CLAUDE_MD"
  echo "  Appended orchestrator instructions to $CLAUDE_MD"
fi

echo ""
echo "=== Installation complete ==="
echo ""
echo "Installed skills:"
echo "  flow-init       Phase 0: Bootstrap project"
echo "  flow-explore    Phase 1: Brainstorm & explore"
echo "  flow-propose    Phase 2: Formal proposal"
echo "  flow-spec       Phase 3: Delta specifications"
echo "  flow-design     Phase 4: Technical design"
echo "  flow-plan       Phase 5: Task breakdown with TDD"
echo "  flow-apply      Phase 6: Execute with TDD + reviews"
echo "  flow-verify     Phase 7: Verification gate"
echo "  flow-archive    Phase 8: Archive to engram"
echo "  flow-debug      Debugging loop (any time)"
echo ""
echo "Commands: /flow-init, /flow-explore, /flow-new, /flow-spec,"
echo "          /flow-design, /flow-plan, /flow-apply, /flow-verify,"
echo "          /flow-archive, /flow-ff, /flow-continue, /flow-debug"
echo ""
echo "Persistence: engram (artifacts stored as flow/{change-name}/{type})"
