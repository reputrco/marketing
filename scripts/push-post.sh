#!/usr/bin/env bash
# push-post.sh — send one generated post to the Content Portal.
# Tool-agnostic: run from Claude, Codex, Cursor, a cron, or by hand.
#
# PORTAL_URL and the token are read from the repo .env automatically
# (PORTAL_URL + PORTAL_API_TOKEN). Just run:
#   ./scripts/push-post.sh linkedin "Your post content here" [YYYY-MM-DD] [source]
#
# Dedup is handled by the portal: same content + same day = no-op.

set -euo pipefail

# Auto-load PORTAL_URL / token from .env (repo root or cwd) if not already set.
ENV_FILE=".env"
[ -f "$ENV_FILE" ] || ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  PORTAL_URL="${PORTAL_URL:-$(grep -E '^PORTAL_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'')}"
  PORTAL_TOKEN="${PORTAL_TOKEN:-$(grep -E '^PORTAL_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'')}"
  PORTAL_TOKEN="${PORTAL_TOKEN:-$(grep -E '^PORTAL_API_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'')}"
fi

PLATFORM="${1:?platform required: fb|linkedin|x}"
CONTENT="${2:?content required}"
DATE="${3:-$(date +%F)}"
SOURCE="${4:-cli}"

: "${PORTAL_URL:?PORTAL_URL missing — add it to .env}"
: "${PORTAL_TOKEN:?token missing — add PORTAL_API_TOKEN to .env}"

# JSON-encode the content safely
CONTENT_JSON=$(printf '%s' "$CONTENT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')

curl -sS -X POST "$PORTAL_URL/api/posts" \
  -H "Authorization: Bearer $PORTAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"platform\":\"$PLATFORM\",\"content\":$CONTENT_JSON,\"status\":\"draft\",\"scheduled_at\":\"${DATE}T09:00:00Z\",\"source\":\"$SOURCE\"}"
echo
