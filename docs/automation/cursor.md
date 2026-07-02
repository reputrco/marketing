# Automating with Cursor

Generate Reputr social posts with the Cursor agent and push them to the Content
Portal. For the full API reference see [`../AUTOMATION.md`](../AUTOMATION.md).

---

## 1. One-time setup

```bash
export PORTAL_URL="https://your-portal.vercel.app"
export PORTAL_TOKEN="paste-the-PORTAL_API_TOKEN"
```

Cursor has no skill system, so supply the "skill" as context: **download `PRODUCT.md`
(and brand-voice / brief files) from the portal's Docs panel** into the repo. Cursor's
agent will read them from the workspace.

Optional: add a **project rule** (Cursor Settings → Rules, or `.cursor/rules/`) so the
agent always knows the workflow, e.g.:

```
When asked to create a social post for Reputr:
1. Use PRODUCT.md for context and match the brand voice.
2. Return only the post text.
3. Push it with: node scripts/push-post.mjs --platform <p> --content "<text>" --source cursor
   using the PORTAL_URL and PORTAL_TOKEN env vars.
```

---

## 2. Generate + push, manually

In the Cursor agent chat:

```
Read PRODUCT.md. Write one Facebook post for Reputr encouraging a free trial.
Then push it to the portal with source "cursor".
```

The agent drafts the post and runs, in the integrated terminal:

```bash
PORTAL_URL="$PORTAL_URL" PORTAL_TOKEN="$PORTAL_TOKEN" \
  node scripts/push-post.mjs --platform fb \
  --content "<the generated post>" --source cursor
```

---

## 3. Scheduled / hands-off runs

Cursor is interactive by default. Two ways to make it recurring:

- **Background agents** — kick off a background agent with the daily prompt from
  [`../../scripts/daily-generate.md`](../../scripts/daily-generate.md); it can run the
  push commands without you watching. (Check your Cursor plan for background-agent
  availability.)
- **External scheduler** — the push step is just a shell command, so you don't even
  need Cursor for the recurring part. Once you're happy with the prompt, run the same
  generation via a `cron` job (or reuse the Codex `codex-daily.sh` pattern) so daily
  posting doesn't depend on Cursor being open.

Dedup on the portal keeps overlapping runs from creating duplicates.

---

## 4. Checklist

- [ ] `PORTAL_URL` / `PORTAL_TOKEN` set in the environment Cursor uses
- [ ] `PRODUCT.md` in the workspace (downloaded from portal Docs)
- [ ] Web access enabled — the daily prompt researches real stats and cites sources
- [ ] Optional `.cursor/rules/` entry describing the push workflow
- [ ] Posts pushed with `--source cursor`
