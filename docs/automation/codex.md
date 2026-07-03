# Automating with Codex

Generate Reputr social posts with OpenAI Codex and push them to the Content Portal.
For the full API reference see [`../AUTOMATION.md`](../AUTOMATION.md).

---

## 1. One-time setup

Nothing to export — the push script reads `PORTAL_URL` and the token from the repo `.env`:

```bash
# .env (repo root, gitignored)
PORTAL_URL=https://reputr-marketing.netlify.app
PORTAL_API_TOKEN=<the same secret the portal uses>
```

Skills and context live **in this repo** (no download needed):

- Marketing skills → `.agents/skills/<skill>/SKILL.md` (e.g. `social`, `copywriting`).
- `PRODUCT.md` → repo root.

---

## 2. Generate + push, manually

Run Codex in the repo and point it at the skill + context:

```
Read .agents/skills/social/SKILL.md and PRODUCT.md.
Write one X (Twitter) post for Reputr about "your Google rating is a conversion lever".
Constraints: under 280 chars, max 1 hashtag. Return only the post text.
```

Then have Codex push it (the script auto-loads `.env`):

```bash
node scripts/push-post.mjs --platform x \
  --content "<the generated post>" --source codex-daily \
  --sources '[{"url":"https://…","title":"…"}]'
```

Or with plain curl (load `.env` first):

```bash
set -a; source .env; set +a
curl -sS -X POST "$PORTAL_URL/api/posts" \
  -H "Authorization: Bearer $PORTAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform":"x","content":"…","status":"draft","source":"codex-daily"}'
```

---

## 3. Daily automation

> Full scheduling examples for all three tools (native + cron): [`scheduling.md`](scheduling.md).

Codex has no built-in scheduler, so wrap the run in a script and schedule it with
`cron` (or a CI schedule / systemd timer).

Create `scripts/codex-daily.sh` (example):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."   # run from the repo root so .env + skills are present

# Ask Codex to research, generate, and push using the shared daily prompt.
# `codex exec` runs a one-shot prompt non-interactively (see your Codex CLI docs).
codex exec "$(cat scripts/daily-generate.md)"
```

Schedule it (daily at 08:00):

```cron
0 8 * * *  /path/to/marketing/scripts/codex-daily.sh >> /tmp/reputr-codex.log 2>&1
```

The `daily-generate.md` prompt tells the agent to research (with sources), produce one
post per platform, and push each. Dedup on the portal makes re-runs safe.

> Check your Codex CLI version for the exact non-interactive command
> (`codex exec` / `codex -q` / equivalent) and pass the prompt accordingly.

---

## 4. Checklist

- [ ] `.env` has `PORTAL_URL` + `PORTAL_API_TOKEN` (script auto-loads them)
- [ ] Skills present at `.agents/skills/` and `PRODUCT.md` in the repo
- [ ] Web access enabled — the daily prompt researches real stats and cites sources
- [ ] `codex-daily.sh` runs from the repo root and wires to `scripts/daily-generate.md`
- [ ] cron/timer scheduled
- [ ] Posts pushed with `--source codex-daily`
