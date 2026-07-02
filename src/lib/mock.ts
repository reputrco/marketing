import { createHash, randomUUID } from "crypto";
import type { Post, PostActivity, Platform, PostStatus, Source } from "./types";

// Toggle with IS_MOCK=true in .env.local — runs the whole portal without Supabase.
export const IS_MOCK = process.env.IS_MOCK === "true";

// Fake "current user" for edits made in mock mode.
const MOCK_USER = "you@reputr.io";

// Persist the in-memory store across HMR reloads in dev.
const g = globalThis as unknown as {
  __mockPostsV4?: Post[];
  __mockActivityV2?: PostActivity[];
};

function hash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function daysFromNow(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString();
}

function make(
  platform: Platform,
  status: PostStatus,
  content: string,
  opts: Partial<Post> = {},
): Post {
  const created = opts.created_at ?? new Date().toISOString();
  return {
    id: randomUUID(),
    platform,
    content,
    media_urls: opts.media_urls ?? [],
    sources: opts.sources ?? [],
    edit_count: opts.edit_count ?? 0,
    status,
    scheduled_at: opts.scheduled_at ?? null,
    posted_at: opts.posted_at ?? null,
    idempotency_key: `${platform}-${created.slice(0, 10)}-${hash(content).slice(0, 16)}`,
    content_hash: hash(content),
    source: opts.source ?? "mock",
    created_by: opts.created_by ?? "demo@reputr.io",
    created_at: created,
    updated_at: created,
    ...opts,
  };
}

function seed(): { posts: Post[]; edits: PostActivity[] } {
  const demo = make(
    "linkedin",
    "scheduled",
    "We analyzed 12,000 local businesses. The ones replying to >80% of reviews grew revenue 1.7x faster than those ignoring them.\n\nReputation isn't passive. It compounds.",
    {
      scheduled_at: daysFromNow(2),
      source: "claude-daily",
      media_urls: ["https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80"],
      edit_count: 3,
      sources: [
        {
          url: "https://www.brightlocal.com/research/local-consumer-review-survey/",
          title: "BrightLocal — Local Consumer Review Survey",
        },
        { url: "https://www.womplyresearch.com/reviews-revenue" },
      ],
    },
  );

  const edits: PostActivity[] = [
    {
      id: randomUUID(),
      post_id: demo.id,
      kind: "status",
      content: null,
      media_urls: [],
      from_status: "draft",
      to_status: "scheduled",
      edited_by: "you@reputr.io",
      edited_at: daysFromNow(0),
    },
    {
      id: randomUUID(),
      post_id: demo.id,
      kind: "edit",
      content:
        "We analyzed 12,000 local businesses. Replying to >80% of reviews correlated with faster growth.",
      media_urls: ["https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80"],
      from_status: null,
      to_status: null,
      edited_by: "you@reputr.io",
      edited_at: daysFromNow(-1),
    },
    {
      id: randomUUID(),
      post_id: demo.id,
      kind: "edit",
      content:
        "We looked at 12,000 local businesses and the pattern was obvious: replying to reviews drives growth.",
      media_urls: [],
      from_status: null,
      to_status: null,
      edited_by: "colleague@reputr.io",
      edited_at: daysFromNow(-2),
    },
  ];

  const posts = [
    make(
      "linkedin",
      "draft",
      "Most businesses lose customers not because of bad service — but because a single unanswered 1-star review is the first thing a prospect sees.\n\nReputr surfaces new reviews the moment they land, so you can respond in minutes, not weeks.\n\nWhat's your average response time?",
      {
        source: "claude-daily",
        media_urls: [
          "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80",
        ],
      },
    ),
    make(
      "x",
      "draft",
      "Your Google rating is a conversion lever, not a vanity metric. A jump from 3.9 → 4.5 can lift click-through by double digits. Are you actively managing it? 📈",
      {
        source: "claude-daily",
        media_urls: [
          "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80",
          "https://images.unsplash.com/photo-1543286386-713bdd548da4?w=800&q=80",
          "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80",
        ],
      },
    ),
    make(
      "fb",
      "scheduled",
      "Happy customers rarely leave reviews on their own — they need a nudge at the right moment. Reputr automates that ask over SMS and email, right after a great experience. Try it free this week.",
      {
        scheduled_at: daysFromNow(1),
        source: "manual",
        media_urls: [
          "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80",
          "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&q=80",
        ],
      },
    ),
    demo,
    make(
      "x",
      "approved",
      "New reviews → instant Slack alert → one-tap AI reply draft. That's the Reputr loop. Ship your reputation like you ship product. 🚀",
      {
        scheduled_at: daysFromNow(0),
        source: "manual",
        media_urls: [
          "https://images.unsplash.com/photo-1611926653458-09294b3142bf?w=800&q=80",
        ],
      },
    ),
    make(
      "fb",
      "posted",
      "🎉 Big milestone: Reputr customers have now collected over 1,000,000 verified reviews. Thank you for trusting us with your reputation.",
      {
        posted_at: daysFromNow(-2),
        scheduled_at: daysFromNow(-2),
        source: "manual",
        media_urls: [
          "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80",
        ],
      },
    ),
    make(
      "linkedin",
      "posted",
      "Case study: a dental group used Reputr to go from 4.1 to 4.8 stars across 9 locations in 90 days — and booked 22% more new-patient calls. Link in comments.",
      {
        posted_at: daysFromNow(-4),
        scheduled_at: daysFromNow(-4),
        source: "claude-daily",
        media_urls: [
          "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80",
          "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80",
        ],
      },
    ),
    make(
      "x",
      "cancelled",
      "Old promo draft — superseded by the Q3 launch messaging. Do not post.",
      { source: "manual" },
    ),
  ];

  return { posts, edits };
}

if (!g.__mockPostsV4 || !g.__mockActivityV2) {
  const seeded = seed();
  g.__mockPostsV4 = seeded.posts;
  g.__mockActivityV2 = seeded.edits;
}

export function mockPosts(): Post[] {
  return g.__mockPostsV4!;
}

export function mockListEdits(postId: string): PostActivity[] {
  return g
    .__mockActivityV2!.filter((e) => e.post_id === postId)
    .sort((a, b) => (a.edited_at < b.edited_at ? 1 : -1));
}

export function mockCreate(input: {
  platform: Platform;
  content: string;
  scheduled_at?: string | null;
  media_urls?: string[];
  sources?: Source[];
}): { ok: boolean; error?: string } {
  const content = input.content.trim();
  const h = hash(content);
  const store = g.__mockPostsV4!;
  if (store.some((p) => p.platform === input.platform && p.content_hash === h))
    return { ok: false, error: "Duplicate: an identical post already exists." };

  store.unshift(
    make(input.platform, "draft", content, {
      scheduled_at: input.scheduled_at ?? null,
      media_urls: input.media_urls ?? [],
      sources: input.sources ?? [],
      source: "manual",
    }),
  );
  return { ok: true };
}

export function mockUpdate(
  id: string,
  patch: {
    content?: string;
    scheduled_at?: string | null;
    media_urls?: string[];
    sources?: Source[];
  },
  editedBy: string = MOCK_USER,
): { ok: boolean; error?: string } {
  const post = g.__mockPostsV4!.find((p) => p.id === id);
  if (!post) return { ok: false, error: "Not found" };

  const nextContent = patch.content !== undefined ? patch.content.trim() : post.content;
  const nextImages = patch.media_urls !== undefined ? patch.media_urls : post.media_urls;
  const contentChanged = nextContent !== post.content;
  const imagesChanged = JSON.stringify(nextImages) !== JSON.stringify(post.media_urls);

  // Record the previous version as an activity row before applying the change.
  if (contentChanged || imagesChanged) {
    g.__mockActivityV2!.unshift({
      id: randomUUID(),
      post_id: post.id,
      kind: "edit",
      content: post.content,
      media_urls: [...post.media_urls],
      from_status: null,
      to_status: null,
      edited_by: editedBy,
      edited_at: new Date().toISOString(),
    });
    post.edit_count += 1;
  }

  post.content = nextContent;
  post.content_hash = hash(nextContent);
  post.media_urls = nextImages;
  if (patch.sources !== undefined) post.sources = patch.sources;
  if (patch.scheduled_at !== undefined) post.scheduled_at = patch.scheduled_at;
  post.updated_at = new Date().toISOString();
  return { ok: true };
}

export function mockUpdateStatus(
  id: string,
  status: PostStatus,
  editedBy: string = MOCK_USER,
): { ok: boolean; error?: string } {
  const post = g.__mockPostsV4!.find((p) => p.id === id);
  if (!post) return { ok: false, error: "Not found" };
  const from = post.status;
  post.status = status;
  if (status === "posted") post.posted_at = new Date().toISOString();
  post.updated_at = new Date().toISOString();

  if (from !== status) {
    g.__mockActivityV2!.unshift({
      id: randomUUID(),
      post_id: post.id,
      kind: "status",
      content: null,
      media_urls: [],
      from_status: from,
      to_status: status,
      edited_by: editedBy,
      edited_at: new Date().toISOString(),
    });
    post.edit_count += 1;
  }
  return { ok: true };
}

export function mockDelete(id: string): { ok: boolean; error?: string } {
  const store = g.__mockPostsV4!;
  const i = store.findIndex((p) => p.id === id);
  if (i === -1) return { ok: false, error: "Not found" };
  store.splice(i, 1);
  g.__mockActivityV2 = g.__mockActivityV2!.filter((e) => e.post_id !== id);
  return { ok: true };
}
