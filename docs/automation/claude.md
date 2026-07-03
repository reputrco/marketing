# Automating with Claude

Generate Reputr social posts with Claude and push them to the Content Portal.
Works in **Cowork** (scheduled tasks) and **Claude Code** (terminal). For the full
API reference see [`../AUTOMATION.md`](../AUTOMATION.md).

---

## 1. One-time setup

Nothing to export. The repo's `.env` holds both values and the push script reads them:

```bash
# .env (repo root, gitignored)
PORTAL_URL=https://reputr-marketing.netlify.app
PORTAL_API_TOKEN=<the same secret the portal uses>
```

Skills and context live **in this repo** — no plugin install, no portal download:

- Marketing skills → `.claude/skills/<skill>/SKILL.md` (e.g. `social`, `copywriting`).
- `PRODUCT.md` → in the repo root (product, ICP, value props).

---

## 2. Why Claude is the easiest of the three

- The `social` skill in `.claude/skills/` **triggers automatically** when you ask for a
  social post — no need to paste skill instructions.
- Claude has a **shell**, so it generates the text *and* runs the push in one session.
- **Cowork scheduled tasks** give native daily scheduling with no cron.

---

## 3. Generate + push, manually

Ask Claude:

```
Using PRODUCT.md and .claude/skills/social, write one LinkedIn post for Reputr about
"responding to reviews drives revenue". Then push it to the portal.
```

Claude writes the post and runs (the script auto-loads `.env`):

```bash
node scripts/push-post.mjs --platform linkedin \
  --content "<the generated post>" --source claude-daily \
  --sources '[{"url":"https://…","title":"…"}]'
```

Repeat `--platform x` and `--platform fb` for the full set.

---

## 4. Daily automation (Cowork scheduled task)

> Full scheduling examples for all three tools (native + cron): [`scheduling.md`](scheduling.md).

1. Open Cowork → create a **scheduled task** (e.g. every day at 8:00 am).
2. Use the ready-made prompt in [`../../scripts/daily-generate.md`](../../scripts/daily-generate.md)
   — it researches, generates one post per platform, and pushes each with
   `source=claude-daily` (sources attached).
3. Make sure the task runs in the repo (so `.env` and the skills are present) with web
   access enabled.

The task runs unattended; dedup on the portal means an accidental double-run never
creates duplicates.

> Alternative: in Claude Code, trigger the same prompt from a local `cron` job running
> `claude -p "<daily-generate prompt>"`.

---

## 5. Checklist

- [ ] `.env` has `PORTAL_URL` + `PORTAL_API_TOKEN` (script auto-loads them)
- [ ] Skills present at `.claude/skills/` and `PRODUCT.md` in the repo
- [ ] Web search enabled — the daily prompt researches real stats and cites sources
- [ ] Scheduled task points at `scripts/daily-generate.md`, runs in the repo
- [ ] Posted with `--source claude-daily` so you can trace it on the board
