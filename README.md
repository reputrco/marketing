# Reputr Content Portal

A shared portal for managing the social-media content pipeline (Facebook, LinkedIn, X)
from **creation → posted**. You and your colleague generate posts on your own machines
(Claude / Codex) and **push** them to the portal via a token-protected API. The portal
manages the pipeline: draft → scheduled → approved → posted / cancelled, with edit,
cancel, delete, and automatic **deduplication**.

Posting to the platforms is **manual for now** — the portal tracks state; you publish by hand.

## Stack

- **Next.js 16** (App Router, Turbopack, React 19.2) on **Vercel**
- **Supabase** (Postgres + Auth) — single source of truth
- Kanban dashboard, email login for you + your colleague
- Token-protected push API callable from any tool

> Requires **Node.js 20.9+** (Next 16 minimum). Auth gating lives in `src/proxy.ts`
> (Next 16 renamed `middleware` → `proxy`).

## Architecture

```
Claude / Codex (your machines)          Portal (Vercel)              Supabase
────────────────────────────────        ──────────────────           ──────────
generate post ──► POST /api/posts ─────► bearer-token guard ─────────► posts table
(scripts/push-post.*)                    dedup on insert               (RLS)
                                         ▲
you + colleague ── login ──► Kanban dashboard (edit / move / cancel / delete)
```

Dedup is enforced in the database, not app code:
- unique `idempotency_key` (`platform-date-hash`, derived automatically), and
- unique `(platform, content_hash)`.
Re-pushing the same post is a silent no-op — so a daily job that runs twice is harmless.

## Preview without Supabase (mock mode)

To see the kanban working before setting up Supabase, set `IS_MOCK=true` in `.env.local`,
then `npm install && npm run dev`. Auth is bypassed and the board loads with seed data
(posts across all five stages). Create / edit / cancel / delete and drag-between-columns
all work against an in-memory store (resets on server restart). Turn it off by removing
`IS_MOCK` or setting it to `false`.

## Setup

### 1. Supabase
1. Create a project at supabase.com.
2. SQL editor → paste and run [`schema.sql`](./schema.sql).
3. Authentication → Users → **add** your and your colleague's emails/passwords.
4. Settings → API Keys → copy the Project URL, the **publishable** key (`sb_publishable_…`), and a **secret** key (`sb_secret_…`). Use the new keys, not the Legacy `anon`/`service_role` tab (legacy keys are being retired in late 2026).

### 2. Environment
```bash
cp .env.local.example .env.local
# fill in the Supabase values, then generate a push token:
openssl rand -hex 32   # paste as PORTAL_API_TOKEN
```

### 3. Run locally
```bash
npm install
npm run dev        # http://localhost:3000  → redirects to /login
```

### 4. Deploy to Vercel
- Import the repo in Vercel, set the same env vars in Project Settings → Environment Variables.
- Deploy. Your portal is at `https://<project>.vercel.app`.

## Pushing posts (from Claude, Codex, Cursor, or a cron)

The scripts read `PORTAL_URL` + `PORTAL_API_TOKEN` from `.env` automatically — nothing
to export. Set them once in `.env` (repo root):

```
PORTAL_URL=https://reputr-marketing.netlify.app   # or http://localhost:3003 in dev
PORTAL_API_TOKEN=<the same secret the portal uses>
```

Node (recommended):
```bash
node scripts/push-post.mjs --platform linkedin --content "Post text" --source claude-daily \
  --sources '[{"url":"https://…","title":"…"}]'
```

Bash/curl:
```bash
./scripts/push-post.sh linkedin "Post text" 2026-07-01 claude-daily
```

Both hit the same endpoint, so all three agents push identically. The marketing skills
they use are vendored in the repo: `.claude/skills/` (Claude) and `.agents/skills/`
(Codex / Cursor).

## Daily automation

Point a **Claude scheduled task** or **Codex automation** at
[`scripts/daily-generate.md`](./scripts/daily-generate.md). It generates one post per
platform and pushes each. Because dedup is automatic, overlapping runs never create
duplicates.

## API reference

| Method | Route | Auth | Purpose |
|-------|-------|------|---------|
| POST | `/api/posts` | Bearer token | Create a post (dedup-safe) |
| GET | `/api/posts?status=&platform=` | Bearer token | List posts |
| PATCH | `/api/posts/:id` | Bearer token | Edit / change status |
| DELETE | `/api/posts/:id` | Bearer token | Delete |

The dashboard uses Supabase server actions (user session + RLS); the API uses the
secret key (bypasses RLS). Keep `SUPABASE_SECRET_KEY` and `PORTAL_API_TOKEN` server-side only.

## Images

Posts can have multiple images (paste a URL or upload from device). Uploads use a
staging lifecycle in the `post-images` bucket:

- On upload, files are staged at `tmp/{postId}/…` (the post id is generated
  client-side for new posts, so images always live in a per-post folder).
- On **save**, staged files are moved to the permanent `{postId}/…` folder, and any
  images removed during the edit are deleted from storage.
- On **cancel/close without saving**, the whole `tmp/{postId}/` folder is discarded,
  so unsaved uploads never linger.
- On **post delete**, the post's images (and those referenced by its history) are
  removed from storage.

Pasted external URLs (e.g. stock photos) are never moved or deleted. In mock mode
there's no storage — uploads are inlined as data URLs for preview only.

> Note: because removing an image deletes it from storage on save, an older history
> version that used that image will show a broken thumbnail and won't restore it.
> If you'd rather preserve history images, switch deletion to happen only on post
> delete.

## Activity history

Every change writes a row to the `post_edits` activity log (separate table, not a
JSON blob). Each row has a `kind`:

- `edit` — content/images changed; the row stores the *previous* content + media.
- `status` — status changed; the row stores `from_status` → `to_status`.

Both record `edited_by` and `edited_at`. A DB trigger keeps `posts.edit_count` in
sync for the badge, and `on delete cascade` removes a post's activity with it.

The activity dialog (opened from the panel) renders an intelligent timeline: content
edits show a word-level diff of exactly what changed (added in green, removed struck
through in red, long unchanged runs collapsed), and status changes render as
`From → To` colored pills. Restoring an edit writes a new activity row, so nothing is
lost. Images referenced only by history are cleaned from storage on post delete.

## Documents

The **Docs** button (top toolbar) opens a side panel backed by a private `docs`
Storage bucket. Both teammates can upload shared files (e.g. `PRODUCT.md`,
briefs), download them, and delete them. Uploading a file with an existing name
**replaces** it (upsert). The bucket is private, so only authenticated users can
list or download; downloads stream the file through the logged-in session (no
public links). In mock mode a few sample docs are shown from memory.

## Roadmap

- Auto-posting via Meta / LinkedIn / X APIs (adds a Vercel Cron publish job)
- Emails and blogs as additional content types (extend the `platform`/type model)
- Click-to-zoom lightbox for card images
