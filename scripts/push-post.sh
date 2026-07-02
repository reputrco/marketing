#!/usr/bin/env bash
# push-post.sh — send one generated post to the Content Portal.
# Tool-agnostic: run from Claude, Codex, a cron, or by hand.
#
# Usage:
#   PORTAL_URL=https://your-portal.vercel.app \
#   PORTAL_TOKEN=xxxxx \
#   ./push-post.sh linkedin "Your post content here" [YYYY-MM-DD] [source]
#
# Dedup is handled by the portal: same content + same day = no-op.

set -euo pipefail

PLATFORM="${1:?platform required: fb|linkedin|x}"
CONTENT="${2:?content required}"
DATE="${3:-$(date +%F)}"
SOURCE="${4:-cli}"

: "${PORTAL_URL:?set PORTAL_URL}"
: "${PORTAL_TOKEN:?set PORTAL_TOKEN}"

# JSON-encode the content safely
CONTENT_JSON=$(printf '%s' "$CONTENT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')

curl -sS -X POST "$PORTAL_URL/api/posts" \
  -H "Authorization: Bearer $PORTAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"platform\":\"$PLATFORM\",\"content\":$CONTENT_JSON,\"status\":\"draft\",\"scheduled_at\":\"${DATE}T09:00:00Z\",\"source\":\"$SOURCE\"}"
echo
