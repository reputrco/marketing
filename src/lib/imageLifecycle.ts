// Server-only module: imported only from server actions. Uses the secret key.
import { createAdminClient } from "./supabase/admin";
import { POST_IMAGES_BUCKET, bucketPathFromPublicUrl } from "./storage";

// Server-side image lifecycle for a post. Runs with the secret key (bypasses RLS).
//
// Layout inside the `post-images` bucket:
//   tmp/{postId}/<uuid>.<ext>   ← freshly uploaded, not yet committed
//   {postId}/<file>             ← permanent, referenced by a saved post

function tmpPrefix(postId: string) {
  return `tmp/${postId}/`;
}

// Commit the images for a post:
//  - move any tmp/{postId}/* referenced in `incoming` into {postId}/*
//  - delete permanent images that were in `previous` but dropped from `incoming`
//  - remove any leftover tmp/{postId}/* that wasn't kept
// Returns the final list of permanent (or external) URLs to store on the post.
export async function finalizePostImages(
  postId: string,
  incoming: string[],
  previous: string[],
): Promise<string[]> {
  const bucket = createAdminClient().storage.from(POST_IMAGES_BUCKET);
  const finalUrls: string[] = [];

  for (const url of incoming) {
    const path = bucketPathFromPublicUrl(url);
    if (path && path.startsWith(tmpPrefix(postId))) {
      const dest = `${postId}/${path.slice(tmpPrefix(postId).length)}`;
      const { error } = await bucket.move(path, dest);
      if (error) {
        // if the move fails, keep the tmp URL rather than losing the image
        finalUrls.push(url);
        continue;
      }
      finalUrls.push(bucket.getPublicUrl(dest).data.publicUrl);
    } else {
      // already permanent, or an external/pasted URL — keep as-is
      finalUrls.push(url);
    }
  }

  // Delete permanent images that were removed in this save.
  const finalSet = new Set(finalUrls);
  const removed = previous
    .filter((u) => !finalSet.has(u))
    .map(bucketPathFromPublicUrl)
    .filter((p): p is string => !!p && !p.startsWith("tmp/"));
  if (removed.length) await bucket.remove(removed);

  // Sweep any leftover staged files for this post.
  await discardTmp(postId);

  return finalUrls;
}

// Remove everything under tmp/{postId}/ (used on cancel and after commit).
export async function discardTmp(postId: string): Promise<void> {
  const bucket = createAdminClient().storage.from(POST_IMAGES_BUCKET);
  const { data } = await bucket.list(`tmp/${postId}`);
  if (data?.length) {
    await bucket.remove(data.map((o) => `tmp/${postId}/${o.name}`));
  }
}
