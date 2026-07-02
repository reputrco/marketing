#!/usr/bin/env node
// push-post.mjs — send one generated post to the Content Portal.
// Tool-agnostic: run from Claude, Codex, a cron, or by hand. Node 18+ (built-in fetch).
//
// Usage:
//   PORTAL_URL=https://your-portal.vercel.app \
//   PORTAL_TOKEN=xxxxx \
//   node push-post.mjs --platform linkedin --content "Post text" [--date 2026-07-01] [--source claude-daily]
//     [--sources '[{"url":"https://…","title":"Study name"}]']
//
// Dedup: the portal derives a stable idempotency_key (platform-date-hash) when you
// omit one, so re-running the same post on the same day is a safe no-op.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const PORTAL_URL = process.env.PORTAL_URL;
const PORTAL_TOKEN = process.env.PORTAL_TOKEN;
if (!PORTAL_URL || !PORTAL_TOKEN) {
  console.error("Set PORTAL_URL and PORTAL_TOKEN env vars.");
  process.exit(1);
}

const platform = args.platform;
const content = args.content;
if (!platform || !content) {
  console.error('Required: --platform <fb|linkedin|x> --content "..."');
  process.exit(1);
}

const date = args.date ?? new Date().toISOString().slice(0, 10);

let sources = [];
if (args.sources) {
  try {
    sources = JSON.parse(args.sources);
    if (!Array.isArray(sources)) throw new Error("not an array");
  } catch (e) {
    console.error('--sources must be a JSON array like [{"url":"…","title":"…"}]');
    process.exit(1);
  }
}

const res = await fetch(`${PORTAL_URL}/api/posts`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${PORTAL_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    platform,
    content,
    status: "draft",
    scheduled_at: `${date}T09:00:00Z`,
    source: args.source ?? "cli",
    sources,
  }),
});

const json = await res.json();
if (!res.ok) {
  console.error(`Error ${res.status}:`, json.error ?? json);
  process.exit(1);
}
console.log(json.duplicate ? "Duplicate — ignored." : "Pushed:", json.post?.id ?? "");
