#!/usr/bin/env bash
# Daily content run: research → generate → push. Used by launchd AND manual runs.
#
#   Manual:  ./scripts/daily.sh              # uses the default agent (claude)
#            AGENT=cursor ./scripts/daily.sh # or cursor / codex
#   launchd: scheduled at noon (see scripts/com.reputr.daily.plist)
#
# Requires: the chosen agent CLI logged in, Node, and .env with
# PORTAL_URL + PORTAL_API_TOKEN (the push script reads these itself).

set -euo pipefail

# launchd/cron use a minimal PATH — make sure the CLIs + node are found.
# If `which claude` (or node) prints a different dir, add it here.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Always run from the repo root so .env, skills, and scripts resolve.
cd "$(dirname "$0")/.."

AGENT="${AGENT:-claude}"     # claude | cursor | codex
PROMPT="$(cat scripts/daily-generate.md)"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') daily run start (agent: $AGENT) ==="

case "$AGENT" in
  claude)
    claude -p "$PROMPT" \
      --allowedTools "Read" "WebSearch" "Bash(node scripts/push-post.mjs *)"
    ;;
  cursor)
    cursor-agent -p "$PROMPT"
    ;;
  codex)
    codex exec --sandbox danger-full-access "$PROMPT"
    ;;
  *)
    echo "Unknown AGENT '$AGENT' (use claude | cursor | codex)"; exit 1
    ;;
esac

echo "=== $(date '+%Y-%m-%d %H:%M:%S') daily run end ==="
