"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { POST_IMAGES_BUCKET, ownedStoragePaths } from "@/lib/storage";
import { finalizePostImages, discardTmp } from "@/lib/imageLifecycle";
import {
  IS_MOCK,
  mockCreate,
  mockUpdate,
  mockUpdateStatus,
  mockDelete,
  mockListEdits,
} from "@/lib/mock";
import {
  PLATFORMS,
  STATUSES,
  type Platform,
  type PostStatus,
  type PostActivity,
  type Source,
} from "@/lib/types";

export type ActionResult = { ok: boolean; error?: string };

export async function createPost(input: {
  id: string; // client-generated post id → also the storage folder name
  platform: Platform;
  content: string;
  scheduled_at?: string | null;
  media_urls?: string[];
  sources?: Source[];
}): Promise<ActionResult> {
  const content = input.content?.trim() ?? "";
  if (!PLATFORMS.includes(input.platform)) return { ok: false, error: "Invalid platform" };
  if (!content) return { ok: false, error: "Content is required" };

  if (IS_MOCK) {
    const res = mockCreate(input);
    revalidatePath("/");
    return res;
  }

  const date = (input.scheduled_at ?? new Date().toISOString()).slice(0, 10);
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const idempotency_key = `${input.platform}-${date}-${hash}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Insert first so a dedup conflict fails before we touch storage.
  const { error } = await supabase.from("posts").insert({
    id: input.id,
    platform: input.platform,
    content,
    status: "draft",
    scheduled_at: input.scheduled_at ?? null,
    media_urls: [],
    sources: input.sources ?? [],
    idempotency_key,
    source: "manual",
    created_by: user?.email ?? null,
  });

  if (error) {
    if ((error as { code?: string }).code === "23505")
      return { ok: false, error: "Duplicate: an identical post already exists." };
    return { ok: false, error: error.message };
  }

  // Move staged tmp images into the post's folder, then store final URLs.
  const finalUrls = await finalizePostImages(input.id, input.media_urls ?? [], []);
  if (finalUrls.length) {
    await supabase.from("posts").update({ media_urls: finalUrls }).eq("id", input.id);
  }

  revalidatePath("/");
  return { ok: true };
}

export async function updatePostStatus(id: string, status: PostStatus): Promise<ActionResult> {
  if (!STATUSES.includes(status)) return { ok: false, error: "Invalid status" };

  if (IS_MOCK) {
    const res = mockUpdateStatus(id, status);
    revalidatePath("/");
    return res;
  }

  const patch: Record<string, unknown> = { status };
  if (status === "posted") patch.posted_at = new Date().toISOString();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: cur } = await supabase.from("posts").select("status").eq("id", id).single();

  const { error } = await supabase.from("posts").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Log the status transition as an activity row.
  if (cur && cur.status !== status) {
    const { error: logErr } = await supabase.from("post_edits").insert({
      post_id: id,
      kind: "status",
      from_status: cur.status,
      to_status: status,
      edited_by: user?.email ?? null,
    });
    if (logErr) {
      console.error("[post_edits] status insert failed:", logErr.message);
      return {
        ok: false,
        error: `Status changed, but activity not logged: ${logErr.message}. Re-run schema.sql.`,
      };
    }
  }

  revalidatePath("/");
  return { ok: true };
}

export async function updatePost(
  id: string,
  patch: {
    content?: string;
    scheduled_at?: string | null;
    media_urls?: string[];
    sources?: Source[];
  },
): Promise<ActionResult> {
  if (IS_MOCK) {
    const res = mockUpdate(id, patch);
    revalidatePath("/");
    return res;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("posts")
    .select("content, media_urls")
    .eq("id", id)
    .single();

  const mediaProvided = patch.media_urls !== undefined;
  const clean: Record<string, unknown> = {};
  if (patch.content !== undefined) clean.content = patch.content.trim();
  if (patch.scheduled_at !== undefined) clean.scheduled_at = patch.scheduled_at;
  if (patch.sources !== undefined) clean.sources = patch.sources;

  // Capture the current version as a history row when content/images change.
  if (current) {
    const contentChanged =
      patch.content !== undefined && patch.content.trim() !== current.content;
    const imagesChanged =
      mediaProvided &&
      JSON.stringify(patch.media_urls) !== JSON.stringify(current.media_urls);

    if (contentChanged || imagesChanged) {
      const { error: logErr } = await supabase.from("post_edits").insert({
        post_id: id,
        kind: "edit",
        content: current.content,
        media_urls: current.media_urls ?? [],
        edited_by: user?.email ?? null,
      });
      if (logErr) console.error("[post_edits] edit insert failed:", logErr.message);
      // posts.edit_count is bumped by the DB trigger.
    }
  }

  // Commit images: move new tmp uploads into {id}/, delete removed permanents.
  if (mediaProvided) {
    clean.media_urls = await finalizePostImages(
      id,
      patch.media_urls ?? [],
      current?.media_urls ?? [],
    );
  }

  if (Object.keys(clean).length === 0) return { ok: false, error: "Nothing to update" };

  const { error } = await supabase.from("posts").update(clean).eq("id", id);
  if (error) {
    if ((error as { code?: string }).code === "23505")
      return { ok: false, error: "Duplicate content for this platform." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true };
}

// Called when a create/edit panel is closed without saving — removes any
// images that were staged under tmp/{postId}/ during that session.
export async function discardDraft(postId: string): Promise<void> {
  if (IS_MOCK) return;
  await discardTmp(postId);
}

export async function getPostEdits(id: string): Promise<PostActivity[]> {
  if (IS_MOCK) return mockListEdits(id);

  const supabase = await createClient();
  const { data } = await supabase
    .from("post_edits")
    .select("*")
    .eq("post_id", id)
    .order("edited_at", { ascending: false });
  return (data ?? []) as PostActivity[];
}

export async function deletePost(id: string): Promise<ActionResult> {
  if (IS_MOCK) {
    const res = mockDelete(id);
    revalidatePath("/");
    return res;
  }

  const supabase = await createClient();

  // Collect images from the post AND its history before deleting, so that
  // versions referenced only by history are cleaned up too.
  const { data: post } = await supabase
    .from("posts")
    .select("media_urls")
    .eq("id", id)
    .single();
  const { data: edits } = await supabase
    .from("post_edits")
    .select("media_urls")
    .eq("post_id", id);

  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  const all = [
    ...(post?.media_urls ?? []),
    ...((edits ?? []).flatMap((e) => e.media_urls ?? [])),
  ];
  const paths = ownedStoragePaths(Array.from(new Set(all)));
  if (paths.length) await supabase.storage.from(POST_IMAGES_BUCKET).remove(paths);

  revalidatePath("/");
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
