# Reputr Content Portal — Automation Guide

How to generate social posts with an AI agent (Claude, Codex, or Cursor) and push
them into the Content Portal through its API. Covers the skills, the generation
workflow, and the exact API calls.

---

## 1. How the whole thing works

The portal **does not generate content**. It's a pipeline manager. Generation
happens on your side (Claude / Codex / Cursor), and the finished post is **pushed**
to the portal over a small, token-protected HTTP API. You and your teammate then
manage it on the kanban board (draft → scheduled → approved → posted / cancelled).

```
  YOU / AGENT (Claude, Codex, Cursor)                 PORTAL (Vercel)          Supabase
  ────────────────────────────────────                ───────────────          ────────
  1. read context (PRODUCT.md, skills)
  2. generate post text  ───────────────►  POST /api/posts  ──►  bearer check ──► posts table
                                           (dedup-safe)          (also: GET / PATCH / DELETE)
                                                    ▲
  YOU + teammate ── log in ──► kanban board (edit / move / cancel / delete)
```

Key properties:

- **One HTTP endpoint** (`/api/posts`) — any tool that can make an HTTP request can push.
- **Token auth** — every request sends `Authorization: Bearer <PORTAL_API_TOKEN>`.
- **Dedup built in** — pushing the same post twice is a safe no-op, so daily jobs
  and retries never create duplicates.
- Posting to Facebook/LinkedIn/X is **manual for now** — the portal tracks state; you
  publish by hand from the board.

---

## 2. What you need (once)

Both values live in the repo's **`.env`** (gitignored) — the push script reads them
itself, so **agents don't export anything**:

```bash
# .env  (in the marketing repo root)
PORTAL_URL=https://reputr-marketing.netlify.app   # or http://localhost:3003 in dev
PORTAL_API_TOKEN=<the same secret the portal uses>
```

`scripts/push-post.mjs` (and `.sh`) auto-load `PORTAL_URL` and `PORTAL_API_TOKEN` from
`.env`. Real environment variables, if set, still take precedence. Never commit `.env`.

---

## 3. The API

Base URL: `$PORTAL_URL`. All routes require the bearer header.

### `POST /api/posts` — create a post

Request body (JSON):

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `platform` | ✅ | `"fb" \| "linkedin" \| "x"` | |
| `content` | ✅ | string | The post text |
| `status` | – | `draft \| scheduled \| approved \| posted \| cancelled` | Defaults to `draft` |
| `media_urls` | – | string[] | Public image URLs (see §7) |
| `sources` | – | `{ url, title? }[]` | Research citations; shown on the post panel |
| `scheduled_at` | – | ISO 8601 string | e.g. `2026-07-05T09:00:00Z` |
| `idempotency_key` | – | string | Dedup key. If omitted, the server derives `platform-YYYY-MM-DD-<hash>` |
| `source` | – | string | Free label, e.g. `claude-daily`, `codex-daily` |
| `created_by` | – | string | Who/what created it |

Responses:

- `201` → `{ "post": { … }, "duplicate": false }` — created.
- `200` → `{ "duplicate": true, "idempotency_key": "…", "message": "Post already exists; ignored." }` — dedup hit.
- `400` → `{ "error": "…" }` — validation (bad platform/status, empty content).
- `401` → `{ "error": "Unauthorized" }` — bad/missing token.
- `500` → `{ "error": "…" }` — server/db error.

**Dedup rule:** a post is a duplicate if its `idempotency_key` was seen before, **or**
if the same `content` already exists for the same `platform`. So identical text on the
same platform is ignored even without a key.

### `GET /api/posts?status=&platform=` — list

Optional `status` and `platform` filters. Returns `{ "posts": [ … ] }`.

### `PATCH /api/posts/:id` — edit / change status

Body may include any of: `content`, `media_urls`, `sources`, `scheduled_at`,
`status`, `posted_at`. Setting `status` to `posted` auto-stamps `posted_at` if you
don't pass it.

### `DELETE /api/posts/:id` — delete

Also removes the post's uploaded images from storage.

---

## 4. Using the skills

The marketing skills are **vendored in this repo**, so every tool reads them locally —
no plugin install, no downloading from the portal:

- **Claude** → `.claude/skills/<skill>/SKILL.md`
- **Codex / Cursor** → `.agents/skills/<skill>/SKILL.md`

(Both folders hold the same skills.) The most relevant for this workflow:

- **`social`** — LinkedIn / X / Facebook posts, threads, hooks, repurposing.
- **`copywriting`** — sharpening a specific line or CTA.
- **`content-strategy`** — deciding *what* to post (themes, angles).
- **`product-marketing`** — the positioning & ICP context doc.

**Context file:** keep `PRODUCT.md` in the repo (what Reputr is, ICP, value props).

### Invoking skills per tool

- **Claude (Cowork / Claude Code):** the `social` skill in `.claude/skills/` triggers
  automatically when you ask for a social post. Just describe the post.
- **Codex / Cursor:** point the agent at `.agents/skills/social/SKILL.md` (and
  `PRODUCT.md`) as context, then ask for the post. The skill content is your instructions.

Either way, the generation step ends with plain post text you then push in §6.

---

## 5. How to generate a post

A reliable prompt template (works for any of the three tools):

```
Context: <paste PRODUCT.md, plus brand voice if you have it>

Task: Write ONE <platform> post for Reputr.
- Audience: multi-location local businesses managing online reviews.
- Goal: <awareness | signups | engagement>.
- Angle/theme for today: <e.g. "responding to reviews drives revenue">.
- Constraints: <e.g. X = under 280 chars, max 1 hashtag; LinkedIn = 2–4 short paras + soft CTA>.

Return only the post text, nothing else.
```

Generate one post per platform when you want the full set (LinkedIn, X, Facebook).

---

## 6. How to push the post to the portal

### Option A — the bundled Node script (recommended)

`scripts/push-post.mjs` (Node 18+, no dependencies) reads `PORTAL_URL` and the token
from `.env` itself — **nothing to export**:

```bash
node scripts/push-post.mjs --platform linkedin \
  --content "Your generated post text here…" \
  --date 2026-07-05 --source claude-daily \
  --sources '[{"url":"https://…","title":"…"}]'
```

There's also `scripts/push-post.sh` (curl-based) with the same `.env` auto-loading.

### Option B — raw curl

Load `.env` first, then call the endpoint directly:

```bash
set -a; source .env; set +a   # loads PORTAL_URL + PORTAL_API_TOKEN

curl -sS -X POST "$PORTAL_URL/api/posts" \
  -H "Authorization: Bearer $PORTAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "linkedin",
    "content": "Your generated post text here…",
    "status": "draft",
    "scheduled_at": "2026-07-05T09:00:00Z",
    "source": "claude-daily",
    "sources": [{"url":"https://…","title":"…"}]
  }'
```

### Per-tool automation

Dedicated step-by-step guides live alongside this file:
[`automation/claude.md`](automation/claude.md) ·
[`automation/codex.md`](automation/codex.md) ·
[`automation/cursor.md`](automation/cursor.md). Summary below.

**Claude (Cowork scheduled task or Claude Code):**
1. Ask Claude to generate the posts (§5). The `social` skill handles the writing.
2. Have Claude run the push command for each post. In Cowork you can create a
   **scheduled task** that runs the whole "generate + push" prompt daily — see
   `scripts/daily-generate.md` for a ready-made prompt. Claude has a shell, so it
   executes the `node scripts/push-post.mjs …` calls itself.

**Codex (CLI / automations):**
1. Point Codex at `.agents/skills/social/SKILL.md` + `PRODUCT.md` for context and ask it
   to generate the post text.
2. Codex runs the push (script auto-loads `.env`):
   ```bash
   node scripts/push-post.mjs --platform x --content "…" --source codex-daily
   ```
   Schedule it with `cron`, a systemd timer, or a Codex automation that runs daily.

**Cursor (agent / terminal):**
1. Open the repo; the Cursor agent reads `.agents/skills/social/SKILL.md` + `PRODUCT.md`
   from the workspace and drafts the post.
2. Let it run the push in Cursor's integrated terminal (same command, `--source cursor`).
   For hands-off runs, Cursor background agents can execute the script on a schedule.

All three converge on the **same** `POST /api/posts` call — the only difference is the
`source` label you pass, so you can see on the board where each post came from.

---

## 7. Images (optional)

`media_urls` expects **public image URLs**, not file uploads. Two ways to use them from
automation:

- Pass URLs you already host (e.g. a CDN or the post's stock image URL).
- Or upload the image to the portal's `post-images` storage bucket first and pass the
  resulting public URL. (Ask if you want a small `upload-image` helper script — the API
  currently accepts URLs only.)

Leave `media_urls` out entirely for text-only posts; you can always add images later by
opening the post in the portal and uploading from the panel.

---

## 8. Daily automation, end to end

1. Store `PORTAL_URL` and `PORTAL_TOKEN` where the scheduler runs.
2. Point a **Claude scheduled task** (or cron / Codex automation / Cursor background
   agent) at the prompt in [`scripts/daily-generate.md`](../scripts/daily-generate.md).
3. It generates one post per platform and pushes each with `source=<tool>-daily`.
4. Because dedup is automatic, overlapping runs never create duplicates.
5. You and your teammate review on the board each morning and publish the approved ones.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `401 Unauthorized` | `PORTAL_TOKEN` doesn't match `PORTAL_API_TOKEN` in the portal env. |
| `400 platform must be one of …` | Use `fb`, `linkedin`, or `x`. |
| `{ "duplicate": true }` | Same text already pushed for that platform today — expected, safe. |
| Nothing appears on the board | Check `PORTAL_URL` (no trailing slash), and that the deploy is live. |
| Want to update instead of create | Use `PATCH /api/posts/:id` with the fields to change. |
```
