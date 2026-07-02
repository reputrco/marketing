import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkBearer } from "@/lib/apiAuth";
import { PLATFORMS, STATUSES, type Platform, type PostStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/posts?status=draft&platform=linkedin  (token-protected list)
export async function GET(req: NextRequest) {
  const authErr = checkBearer(req);
  if (authErr) return NextResponse.json({ error: authErr }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const supabase = createAdminClient();
  let query = supabase.from("posts").select("*").order("created_at", { ascending: false });

  const status = searchParams.get("status");
  const platform = searchParams.get("platform");
  if (status) query = query.eq("status", status);
  if (platform) query = query.eq("platform", platform);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data });
}

// POST /api/posts  — create a post (dedup-safe). Called by Claude / Codex / cron.
export async function POST(req: NextRequest) {
  const authErr = checkBearer(req);
  if (authErr) return NextResponse.json({ error: authErr }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platform = body.platform as Platform;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const status = (body.status ?? "draft") as PostStatus;

  if (!PLATFORMS.includes(platform))
    return NextResponse.json({ error: `platform must be one of ${PLATFORMS.join(", ")}` }, { status: 400 });
  if (!content)
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  if (!STATUSES.includes(status))
    return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });

  // If caller didn't supply a dedup key, derive a stable one: platform-date-hash.
  const date = (body.scheduled_at ?? new Date().toISOString()).slice(0, 10);
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const idempotency_key: string = body.idempotency_key ?? `${platform}-${date}-${hash}`;

  // sources: [{ url, title? }] — keep only entries with a string url
  const sources = Array.isArray(body.sources)
    ? body.sources
        .filter((s: unknown): s is { url: string; title?: string } =>
          Boolean(s && typeof (s as { url?: unknown }).url === "string"),
        )
        .map((s: { url: string; title?: string }) => ({ url: s.url, title: s.title }))
    : [];

  const row = {
    platform,
    content,
    status,
    media_urls: Array.isArray(body.media_urls) ? body.media_urls : [],
    sources,
    scheduled_at: body.scheduled_at ?? null,
    idempotency_key,
    source: body.source ?? "api",
    created_by: body.created_by ?? null,
  };

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("posts").insert(row).select().single();

  if (error) {
    // 23505 = unique_violation → a duplicate (same key OR same content on platform).
    if ((error as any).code === "23505") {
      return NextResponse.json(
        { duplicate: true, idempotency_key, message: "Post already exists; ignored." },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ post: data, duplicate: false }, { status: 201 });
}
