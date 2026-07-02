export const PLATFORMS = ["fb", "linkedin", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const STATUSES = [
  "draft",
  "scheduled",
  "approved",
  "posted",
  "cancelled",
] as const;
export type PostStatus = (typeof STATUSES)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  fb: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
};

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  approved: "Approved",
  posted: "Posted",
  cancelled: "Cancelled",
};

export type ActivityKind = "edit" | "status";

export interface PostActivity {
  id: string;
  post_id: string;
  kind: ActivityKind;
  content: string | null; // for kind="edit": the content BEFORE this edit
  media_urls: string[]; // for kind="edit": the media BEFORE this edit
  from_status: PostStatus | null; // for kind="status"
  to_status: PostStatus | null; // for kind="status"
  edited_by: string | null;
  edited_at: string;
}

export interface Source {
  url: string;
  title?: string;
}

export interface Post {
  id: string;
  platform: Platform;
  content: string;
  media_urls: string[];
  sources: Source[];
  edit_count: number;
  status: PostStatus;
  scheduled_at: string | null;
  posted_at: string | null;
  idempotency_key: string;
  content_hash: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
