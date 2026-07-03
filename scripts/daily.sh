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

# launchd/manual shells use a minimal PATH — the agent CLIs may be installed via
# nvm, npm -g, or the native installer, none of which are on that PATH.
# 1) Pull in your real interactive shell PATH (covers nvm / homebrew / custom dirs).
if command -v zsh >/dev/null 2>&1; then
  USER_PATH="$(zsh -lic 'print -rn -- $PATH' 2>/dev/null || true)"
  [ -n "$USER_PATH" ] && export PATH="$USER_PATH:$PATH"
fi
# 2) Add the usual install locations as a fallback.
export PATH="$HOME/.local/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Always run from the repo root so .env, skills, and scripts resolve.
cd "$(dirname "$0")/.."

AGENT="${AGENT:-claude}"     # claude | cursor | codex
PROMPT="$(cat scripts/daily-generate.md)"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') daily run start (agent: $AGENT) ==="

case "$AGENT" in
  claude)
    # One-time: run `claude` once interactively IN THIS FOLDER and accept the
    # "trust this folder" prompt, or the headless run below will hang on it.
    # --allowedTools pre-authorizes every tool the job needs so it never prompts.
    claude -p "$PROMPT" \
      --allowedTools "Read,Write,Edit,Bash,WebSearch,Glob,Grep"
    ;;
  cursor)
    # -f trusts this directory (headless can't answer the trust prompt).
    # If it still pauses to approve running commands, use --yolo instead of -f.
    cursor-agent -p "$PROMPT" -f
    ;;
  codex)
    # NOTE: requires the Codex CLI installed (`npm i -g @openai/codex`).
    codex exec --sandbox danger-full-access "$PROMPT"
    ;;
  *)
    echo "Unknown AGENT '$AGENT' (use claude | cursor | codex)"; exit 1
    ;;
esac

echo "=== $(date '+%Y-%m-%d %H:%M:%S') daily run end ==="
