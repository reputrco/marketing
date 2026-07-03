# Automating with Cursor

Generate Reputr social posts with the Cursor agent and push them to the Content
Portal. For the full API reference see [`../AUTOMATION.md`](../AUTOMATION.md).

---

## 1. One-time setup

Nothing to export — the push script reads `PORTAL_URL` and the token from the repo `.env`:

```bash
# .env (repo root, gitignored)
PORTAL_URL=https://reputr-marketing.netlify.app
PORTAL_API_TOKEN=<the same secret the portal uses>
```

Skills and context live **in this repo** — the Cursor agent reads them from the
workspace (no download):

- Marketing skills → `.agents/skills/<skill>/SKILL.md` (e.g. `social`, `copywriting`).
- `PRODUCT.md` → repo root.

Optional: add a **project rule** (`.cursor/rules/`) so the agent always knows the flow:

```
When asked to create a social post for Reputr:
1. Read .agents/skills/social/SKILL.md and PRODUCT.md; match the brand voice.
2. Return only the post text.
3. Push it: node scripts/push-post.mjs --platform <p> --content "<text>" --source cursor
   (the script reads PORTAL_URL + token from .env automatically).
```

---

## 2. Generate + push, manually

In the Cursor agent chat:

```
Read .agents/skills/social/SKILL.md and PRODUCT.md. Write one Facebook post for Reputr
encouraging a free trial. Then push it to the portal with source "cursor".
```

The agent drafts the post and runs, in the integrated terminal:

```bash
node scripts/push-post.mjs --platform fb \
  --content "<the generated post>" --source cursor \
  --sources '[{"url":"https://…","title":"…"}]'
```

---

## 3. Scheduled / hands-off runs

> Full scheduling examples for all three tools (native + cron): [`scheduling.md`](scheduling.md).

Cursor is interactive by default. Two ways to make it recurring:

- **Background agents** — kick off a background agent with the daily prompt from
  [`../../scripts/daily-generate.md`](../../scripts/daily-generate.md); it can run the
  push commands without you watching. (Check your Cursor plan for background-agent
  availability.)
- **External scheduler** — the push step is just a shell command, so you don't need
  Cursor for the recurring part. Once the prompt is dialed in, run the same generation
  via a `cron` job (reuse the Codex `codex-daily.sh` pattern) so daily posting doesn't
  depend on Cursor being open.

Dedup on the portal keeps overlapping runs from creating duplicates.

---

## 4. Checklist

- [ ] `.env` has `PORTAL_URL` + `PORTAL_API_TOKEN` (script auto-loads them)
- [ ] Skills present at `.agents/skills/` and `PRODUCT.md` in the repo
- [ ] Web access enabled — the daily prompt researches real stats and cites sources
- [ ] Optional `.cursor/rules/` entry describing the push workflow
- [ ] Posts pushed with `--source cursor`
