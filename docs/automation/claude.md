# Automating with Claude

Generate Reputr social posts with Claude and push them to the Content Portal.
Works in **Cowork** (scheduled tasks) and **Claude Code** (terminal). For the full
API reference see [`../AUTOMATION.md`](../AUTOMATION.md).

---

## 1. One-time setup

Set the two secrets where Claude runs:

```bash
export PORTAL_URL="https://your-portal.vercel.app"
export PORTAL_TOKEN="paste-the-PORTAL_API_TOKEN"
```

- In **Cowork**, add these to the scheduled task's environment / prompt.
- In **Claude Code**, put them in your shell profile or a local `.env` you source.

Optional but recommended: upload `PRODUCT.md` (and any brand-voice notes) to the
portal's **Docs** panel so every run can pull the same context.

---

## 2. Why Claude is the easiest of the three

- The `reputr-marketing` **`social` skill triggers automatically** when you ask for a
  social post — no need to paste skill instructions.
- Claude has a **shell**, so it can generate the text *and* run the push command in the
  same session.
- **Cowork scheduled tasks** give you native daily scheduling with no cron.

---

## 3. Generate + push, manually

Ask Claude:

```
Using PRODUCT.md as context, write one LinkedIn post for Reputr about
"responding to reviews drives revenue". Then push it to the portal.
```

Claude writes the post (via the `social` skill) and runs:

```bash
PORTAL_URL="$PORTAL_URL" PORTAL_TOKEN="$PORTAL_TOKEN" \
  node scripts/push-post.mjs --platform linkedin \
  --content "<the generated post>" --source claude-daily
```

Repeat `--platform x` and `--platform fb` for the full set.

---

## 4. Daily automation (Cowork scheduled task)

1. Open Cowork → create a **scheduled task** (e.g. every day at 8:00 am).
2. Use the ready-made prompt in [`../../scripts/daily-generate.md`](../../scripts/daily-generate.md)
   — it generates one post per platform and pushes each with `source=claude-daily`.
3. Make sure `PORTAL_URL` and `PORTAL_TOKEN` are available to the task.

The task runs unattended; dedup on the portal means an accidental double-run never
creates duplicates.

> Alternative: in Claude Code you can trigger the same prompt from a local `cron`
> job that runs `claude -p "<daily-generate prompt>"`.

---

## 5. Checklist

- [ ] `PORTAL_URL` / `PORTAL_TOKEN` set
- [ ] `reputr-marketing` plugin installed (for the `social` skill)
- [ ] `PRODUCT.md` uploaded to the portal Docs panel
- [ ] Web search enabled — the daily prompt researches real stats and cites sources
- [ ] Scheduled task points at `scripts/daily-generate.md`
- [ ] Posted with `--source claude-daily` so you can trace it on the board
