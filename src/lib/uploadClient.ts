"use client";

import { createClient } from "./supabase/browser";
import { POST_IMAGES_BUCKET } from "./storage";

// Upload files to a STAGING folder: tmp/{postId}/...
// They only become permanent (moved to {postId}/...) when the post is saved.
// Returns the public URLs of the staged files (for preview in the panel).
export async function uploadImagesToTmp(
  postId: string,
  files: FileList | File[],
): Promise<string[]> {
  const supabase = createClient();
  const out: string[] = [];

  for (const file of Array.from(files)) {
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `tmp/${postId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(POST_IMAGES_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path);
    out.push(data.publicUrl);
  }

  return out;
}
