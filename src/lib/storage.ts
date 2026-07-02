// Supabase Storage bucket that holds uploaded post images.
export const POST_IMAGES_BUCKET = "post-images";

// Given a Supabase public URL, return the object path inside our bucket, or null
// when the URL isn't one of our stored objects (e.g. a pasted external image URL
// like an Unsplash link, or a data: URL). Used to know which images to delete.
export function bucketPathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${POST_IMAGES_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

// Filter a list of media URLs down to the object paths we own in storage.
export function ownedStoragePaths(urls: string[]): string[] {
  return urls
    .map(bucketPathFromPublicUrl)
    .filter((p): p is string => p !== null);
}
