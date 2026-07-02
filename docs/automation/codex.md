# Automating with Codex

Generate Reputr social posts with OpenAI Codex and push them to the Content Portal.
For the full API reference see [`../AUTOMATION.md`](../AUTOMATION.md).

---

## 1. One-time setup

```bash
export PORTAL_URL="https://your-portal.vercel.app"
export PORTAL_TOKEN="paste-the-PORTAL_API_TOKEN"
```

Codex does **not** have Claude's skill system, so the "skill" is supplied as context:
**download `PRODUCT.md` (and any brand-voice / brief files) from the portal's Docs
panel** and keep them in the repo or pass them in the prompt.

---

## 2. Generate + push, manually

Run Codex in the repo and prompt it with the context:

```
Context: <contents of PRODUCT.md>

Write one X (Twitter) post for Reputr about "your Google rating is a conversion lever".
Constraints: under 280 chars, max 1 hashtag. Return only the post text.
```

Then have Codex push it (it runs shell commands):

```bash
PORTAL_URL="$PORTAL_URL" PORTAL_TOKEN="$PORTAL_TOKEN" \
  node scripts/push-post.mjs --platform x \
  --content "<the generated post>" --source codex-daily
```

Or with plain curl if Node isn't handy:

```bash
curl -sS -X POST "$PORTAL_URL/api/posts" \
  -H "Authorization: Bearer $PORTAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform":"x","content":"…","status":"draft","source":"codex-daily"}'
```

---

## 3. Daily automation

Codex has no built-in scheduler, so wrap the run in a script and schedule it with
`cron` (or a CI schedule / systemd timer).

Create `scripts/codex-daily.sh` (example):

```bash
#!/usr/bin/env bash
set -euo pipefail
export PORTAL_URL="https://your-portal.vercel.app"
export PORTAL_TOKEN="…"

# Ask Codex to generate + push using the shared daily prompt.
# `codex exec` runs a one-shot prompt non-interactively (see your Codex CLI docs).
codex exec --cd "$(dirname "$0")/.." \
  "$(cat scripts/daily-generate.md)"
```

Schedule it (daily at 08:00):

```cron
0 8 * * *  /path/to/marketing/scripts/codex-daily.sh >> /tmp/reputr-codex.log 2>&1
```

The `daily-generate.md` prompt already tells the agent to produce one post per
platform and push each. Dedup on the portal makes re-runs safe.

> Check your Codex CLI version for the exact non-interactive command
> (`codex exec` / `codex -q` / equivalent) and pass the prompt accordingly.

---

## 4. Checklist

- [ ] `PORTAL_URL` / `PORTAL_TOKEN` exported in the scheduled environment
- [ ] `PRODUCT.md` available as context (downloaded from portal Docs)
- [ ] Web access enabled — the daily prompt researches real stats and cites sources
- [ ] `codex-daily.sh` wired to `scripts/daily-generate.md`
- [ ] cron/timer scheduled
- [ ] Posts pushed with `--source codex-daily`
