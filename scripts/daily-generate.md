# Daily generation prompt (generic — Claude, Codex, or Cursor)

Paste this as the instruction for a daily run in **any** agent. It researches, writes
one post per platform, and pushes each to the portal. Dedup is automatic, so re-runs
are safe.

Before running, the agent needs:
- `PORTAL_URL` and `PORTAL_TOKEN` in the environment.
- **Web access enabled** (this prompt requires browsing).
- Context: `PRODUCT.md` (and any brand-voice notes) — from the repo or the portal Docs panel.
- A `SOURCE` label for traceability: use `claude-daily`, `codex-daily`, or `cursor`.

---

You are generating Reputr's daily social posts. Follow these steps in order.

## Step 1 — Load context
Read `PRODUCT.md` (product, audience/ICP, value props) and any brand-voice notes.
Match that voice in everything you write.

## Step 2 — Research first (required)
Before writing anything, **browse the web** for recent, quantitative information
relevant to Reputr's space:
- online reviews & ratings, reputation management, review response rates,
  local/SMB business impact, star-rating → conversion/revenue effects, consumer
  trust in reviews, industry benchmarks.

Rules for research:
- Prefer sources from the **last 12–24 months** and reputable publishers
  (industry reports, well-known studies, credible surveys).
- Collect **specific numbers** (percentages, multipliers, sample sizes), each with a
  **source URL**.
- **Do not invent or estimate statistics.** Only use figures you actually found and
  can cite. If you can't verify a number, don't use it.

## Step 3 — Write one post per platform
Ground each post in a real stat from Step 2. Keep Reputr's voice.

- **LinkedIn** — professional, 2–4 short paragraphs, 1 data-backed insight + soft CTA.
- **X** — under 280 chars, punchy, 1 idea, max 1 hashtag.
- **Facebook** — friendly, 1–2 paragraphs, conversational.

Vary the angle from recent posts (if unsure, first call
`GET $PORTAL_URL/api/posts` with the bearer token to see what's already there).
Keep post text clean; you may add a short `Source: <publisher>` line on LinkedIn where
it strengthens credibility, but don't dump raw URLs into X/Facebook.

## Step 4 — Push each post (with its sources)
Replace `SOURCE` with your tool's label (`claude-daily` / `codex-daily` / `cursor`).
Pass the citations from Step 2 via `--sources` (a JSON array of `{url, title}`), so they
are saved on the post and shown in the portal panel.

```bash
PORTAL_URL="$PORTAL_URL" PORTAL_TOKEN="$PORTAL_TOKEN" \
  node scripts/push-post.mjs --platform linkedin --content "<the linkedin post>" --source SOURCE \
  --sources '[{"url":"https://…","title":"BrightLocal 2025 survey"}]'

PORTAL_URL="$PORTAL_URL" PORTAL_TOKEN="$PORTAL_TOKEN" \
  node scripts/push-post.mjs --platform x --content "<the x post>" --source SOURCE \
  --sources '[{"url":"https://…","title":"…"}]'

PORTAL_URL="$PORTAL_URL" PORTAL_TOKEN="$PORTAL_TOKEN" \
  node scripts/push-post.mjs --platform fb --content "<the facebook post>" --source SOURCE \
  --sources '[{"url":"https://…","title":"…"}]'
```

(If Node isn't available, use the equivalent `curl` from `docs/AUTOMATION.md` §6 —
include a `"sources": [{"url":"…","title":"…"}]` array in the JSON body.)

## Step 5 — Report
Output a short summary:
- For each platform: which post was **pushed** vs **skipped as duplicate**.
- The **stat + source URL(s)** used for each post, so a human can verify.
