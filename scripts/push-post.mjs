#!/usr/bin/env node
// push-post.mjs — send one generated post to the Content Portal.
// Tool-agnostic: run from Claude, Codex, Cursor, a cron, or by hand. Node 18+.
//
// PORTAL_URL and the token are read automatically from the repo's .env
// (PORTAL_URL + PORTAL_API_TOKEN). You do NOT need to export anything — just run:
//
//   node scripts/push-post.mjs --platform linkedin --content "Post text" [--date 2026-07-01]
//     [--source claude-daily] [--sources '[{"url":"https://…","title":"Study name"}]']
//
// (Real env vars, if set, still take precedence over .env.)
//
// Dedup: the portal derives a stable idempotency_key (platform-date-hash) when you
// omit one, so re-running the same post on the same day is a safe no-op.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load KEY=VALUE pairs from .env (repo root or cwd) without overriding real env vars.
function loadDotEnv() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(scriptDir, "..", ".env"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const val = m[2].replace(/^["']|["']$/g, "");
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
    break; // first .env found wins
  }
}
loadDotEnv();

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const PORTAL_URL = process.env.PORTAL_URL;
const PORTAL_TOKEN = process.env.PORTAL_TOKEN || process.env.PORTAL_API_TOKEN;
if (!PORTAL_URL || !PORTAL_TOKEN) {
  console.error(
    "Missing PORTAL_URL and/or token. Add PORTAL_URL and PORTAL_API_TOKEN to .env.",
  );
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
