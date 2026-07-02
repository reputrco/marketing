import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkBearer } from "@/lib/apiAuth";
import { POST_IMAGES_BUCKET, ownedStoragePaths } from "@/lib/storage";
import { STATUSES, type PostStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// PATCH /api/posts/:id  — edit content / change status / schedule.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = checkBearer(req);
  if (authErr) return NextResponse.json({ error: authErr }, { status: 401 });

  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.content === "string") patch.content = body.content.trim();
  if (Array.isArray(body.media_urls)) patch.media_urls = body.media_urls;
  if (Array.isArray(body.sources)) patch.sources = body.sources;
  if (body.scheduled_at !== undefined) patch.scheduled_at = body.scheduled_at;
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as PostStatus))
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    patch.status = body.status;
    if (body.status === "posted" && body.posted_at === undefined)
      patch.posted_at = new Date().toISOString();
  }
  if (body.posted_at !== undefined) patch.posted_at = body.posted_at;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("posts")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

// DELETE /api/posts/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = checkBearer(req);
  if (authErr) return NextResponse.json({ error: authErr }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  // Grab images from the post AND its history before deleting.
  const { data: existing } = await supabase
    .from("posts")
    .select("media_urls")
    .eq("id", id)
    .single();
  const { data: edits } = await supabase
    .from("post_edits")
    .select("media_urls")
    .eq("post_id", id);

  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = [
    ...(existing?.media_urls ?? []),
    ...((edits ?? []).flatMap((e: { media_urls?: string[] }) => e.media_urls ?? [])),
  ];
  const paths = ownedStoragePaths(Array.from(new Set(all)));
  if (paths.length) await supabase.storage.from(POST_IMAGES_BUCKET).remove(paths);

  return NextResponse.json({ ok: true });
}
