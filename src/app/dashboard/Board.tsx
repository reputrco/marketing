"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  STATUSES,
  STATUS_LABEL,
  PLATFORMS,
  PLATFORM_LABEL,
  type Post,
  type PostStatus,
  type Platform,
} from "@/lib/types";
import {
  PlatformIcon,
  TrashIcon,
  BanIcon,
  CloseIcon,
  PlusIcon,
  CopyIcon,
  CheckIcon,
  HistoryIcon,
  FilterIcon,
  SearchIcon,
  FileIcon,
  LinkIcon,
  RefreshIcon,
  SortIcon,
} from "@/components/icons";
import type { PostActivity, Source } from "@/lib/types";
import { diffWords, diffImages, type DiffPart } from "@/lib/diff";
import { uploadImagesToTmp } from "@/lib/uploadClient";
import DocsPanel from "./DocsPanel";
import {
  createPost,
  updatePost,
  updatePostStatus,
  deletePost,
  getPostEdits,
  discardDraft,
  type ActionResult,
} from "./actions";

const STATUS_STYLE: Record<PostStatus, { dot: string; pill: string }> = {
  draft: { dot: "bg-slate-400", pill: "bg-slate-100 text-slate-600" },
  scheduled: { dot: "bg-brand", pill: "bg-brand-soft text-brand-dark" },
  approved: { dot: "bg-gold", pill: "bg-gold-soft text-gold-ink" },
  posted: { dot: "bg-grass", pill: "bg-grass-soft text-grass-ink" },
  cancelled: { dot: "bg-danger", pill: "bg-danger-soft text-danger" },
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---- sorting ----
type SortKey =
  | "created_desc"
  | "created_asc"
  | "scheduled_asc"
  | "scheduled_desc"
  | "updated_desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created_desc", label: "Newest first" },
  { key: "created_asc", label: "Oldest first" },
  { key: "scheduled_asc", label: "Scheduled (soonest)" },
  { key: "scheduled_desc", label: "Scheduled (latest)" },
  { key: "updated_desc", label: "Recently updated" },
];

function sortPosts(list: Post[], key: SortKey): Post[] {
  const by = [...list];
  const t = (v: string | null) => (v ? new Date(v).getTime() : 0);
  switch (key) {
    case "created_asc":
      return by.sort((a, b) => t(a.created_at) - t(b.created_at));
    case "scheduled_asc":
      return by.sort((a, b) => t(a.scheduled_at) - t(b.scheduled_at));
    case "scheduled_desc":
      return by.sort((a, b) => t(b.scheduled_at) - t(a.scheduled_at));
    case "updated_desc":
      return by.sort((a, b) => t(b.updated_at) - t(a.updated_at));
    case "created_desc":
    default:
      return by.sort((a, b) => t(b.created_at) - t(a.created_at));
  }
}

// ---- source → logo badge ----
// Icon only (no label). SVG logos are rendered as CSS masks so we can tint them;
// the Codex PNG is shown as-is (black).
function SourceBadge({ source }: { source: string | null }) {
  const s = (source ?? "").toLowerCase();

  if (s.includes("codex")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/sources/codex.png"
        alt=""
        title="Source: Codex"
        className="ml-auto h-4 w-4 object-contain"
      />
    );
  }

  let mask = "/sources/user.svg";
  let color = "#0052d0"; // brand blue for user
  let label = "User";
  if (s.includes("claude")) {
    mask = "/sources/claude.svg";
    color = "#D97757"; // Claude orange
    label = "Claude";
  } else if (s.includes("cursor")) {
    mask = "/sources/cursor.svg";
    color = "#191c1e"; // ink / black
    label = "Cursor";
  }

  return (
    <span
      title={`Source: ${label}`}
      className="ml-auto inline-block h-4 w-4"
      style={{
        backgroundColor: color,
        maskImage: `url(${mask})`,
        WebkitMaskImage: `url(${mask})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

function filesToDataUrls(files: FileList): Promise<string[]> {
  return Promise.all(
    Array.from(files).map(
      (f) =>
        new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(f);
        }),
    ),
  );
}

export default function Board({
  initialPosts,
  isMock,
}: {
  initialPosts: Post[];
  isMock: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Local copy of posts so status changes / deletes feel instant (optimistic).
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  useEffect(() => setPosts(initialPosts), [initialPosts]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<PostStatus | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [history, setHistory] = useState<Post | null>(null);
  const [creating, setCreating] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // remembers where a press started, to tell a click apart from a drag
  const pressPos = useRef<{ x: number; y: number } | null>(null);

  // filters + sort
  const [showFilters, setShowFilters] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showSort, setShowSort] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("created_desc");

  const activeFilters =
    (platformFilter !== "all" ? 1 : 0) +
    (query.trim() ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0);

  const visiblePosts = sortPosts(
    posts.filter((p) => {
      if (platformFilter !== "all" && p.platform !== platformFilter) return false;
      if (query.trim() && !p.content.toLowerCase().includes(query.trim().toLowerCase()))
        return false;
      // date range on scheduled_at (fallback created_at)
      if (dateFrom || dateTo) {
        const d = (p.scheduled_at ?? p.created_at).slice(0, 10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
      }
      return true;
    }),
    sortBy,
  );

  function clearFilters() {
    setPlatformFilter("all");
    setQuery("");
    setDateFrom("");
    setDateTo("");
  }

  async function copy(post: Post) {
    try {
      await navigator.clipboard.writeText(post.content);
      setCopiedId(post.id);
      setTimeout(() => setCopiedId((c) => (c === post.id ? null : c)), 1500);
    } catch {
      setError("Couldn't copy to clipboard");
    }
  }

  // Non-optimistic runner (panel save, restore) — waits, then refreshes.
  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
      router.refresh();
    });
  }

  // Optimistic runner — update the UI now, persist in the background, resync after.
  function optimistic(
    mutate: (list: Post[]) => Post[],
    fn: () => Promise<ActionResult>,
  ) {
    setError(null);
    setPosts((prev) => mutate(prev));
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
      router.refresh(); // confirms (or reverts) against the DB
    });
  }

  function changeStatus(id: string, status: PostStatus) {
    optimistic(
      (list) => list.map((p) => (p.id === id ? { ...p, status } : p)),
      () => updatePostStatus(id, status),
    );
  }

  function removePost(id: string) {
    optimistic(
      (list) => list.filter((p) => p.id !== id),
      () => deletePost(id),
    );
  }

  function refresh() {
    setError(null);
    startTransition(() => router.refresh());
  }

  function onDrop(status: PostStatus) {
    if (dragId) changeStatus(dragId, status);
    setDragId(null);
    setOverCol(null);
  }

  return (
    <div>
      {/* top progress bar while saving/refreshing */}
      <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden">
        {pending && <div className="topbar-anim" />}
      </div>

      <div className="mb-5 flex items-center gap-3">
        {error && (
          <span className="rounded-md bg-danger-soft px-2.5 py-1 text-sm text-danger">
            {error}
          </span>
        )}
        {activeFilters > 0 && (
          <span className="text-sm text-ink-subtle">
            Showing {visiblePosts.length} of {posts.length}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowSort((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                showSort
                  ? "border-brand bg-brand-soft text-brand-dark"
                  : "border-surface-line bg-white text-ink-muted hover:border-brand/40"
              }`}
            >
              <SortIcon className="h-4 w-4" />
              Sort
            </button>
            {showSort && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowSort(false)} />
                <div className="absolute right-0 z-40 mt-2 w-52 rounded-xl border border-surface-line bg-surface-card p-1.5 shadow-elevated">
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      onClick={() => {
                        setSortBy(o.key);
                        setShowSort(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-surface-sunk ${
                        sortBy === o.key ? "font-semibold text-brand" : "text-ink-muted"
                      }`}
                    >
                      {o.label}
                      {sortBy === o.key && <CheckIcon className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setShowDocs(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-line bg-white px-3 py-2 text-sm font-medium text-ink-muted transition hover:border-brand/40"
          >
            <FileIcon className="h-4 w-4" />
            Docs
          </button>

          <div className="relative">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                activeFilters > 0 || showFilters
                  ? "border-brand bg-brand-soft text-brand-dark"
                  : "border-surface-line bg-white text-ink-muted hover:border-brand/40"
              }`}
            >
              <FilterIcon className="h-4 w-4" />
              Filters
              {activeFilters > 0 && (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold leading-none text-white">
                  {activeFilters}
                </span>
              )}
            </button>

            {showFilters && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowFilters(false)} />
                <div className="absolute right-0 z-40 mt-2 w-96 rounded-xl border border-surface-line bg-surface-card p-4 shadow-elevated">
                  <label className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-subtle">
                    Search
                  </label>
                  <div className="relative mb-4">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search content…"
                      className="w-full rounded-lg border border-surface-line bg-white py-2 pl-8 pr-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </div>

                  <label className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-subtle">
                    Platform
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setPlatformFilter("all")}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        platformFilter === "all"
                          ? "border-brand bg-brand-soft text-brand-dark"
                          : "border-surface-line text-ink-muted hover:border-brand/40"
                      }`}
                    >
                      All
                    </button>
                    {PLATFORMS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPlatformFilter(p)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                          platformFilter === p
                            ? "border-brand bg-brand-soft text-brand-dark"
                            : "border-surface-line text-ink-muted hover:border-brand/40"
                        }`}
                      >
                        <PlatformIcon platform={p} className="h-4 w-4" />
                        {PLATFORM_LABEL[p]}
                      </button>
                    ))}
                  </div>

                  <label className="mb-1.5 mt-4 block text-xs font-semibold tracking-wide text-ink-subtle">
                    Date range
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full rounded-lg border border-surface-line bg-white px-2 py-1.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                    <span className="text-xs text-ink-subtle">to</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full rounded-lg border border-surface-line bg-white px-2 py-1.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </div>

                  {activeFilters > 0 && (
                    <button
                      onClick={clearFilters}
                      className="mt-4 w-full rounded-lg border border-surface-line py-1.5 text-sm font-medium text-ink-muted hover:border-brand/40"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <button
            onClick={refresh}
            title="Refresh"
            aria-label="Refresh"
            className="inline-flex items-center justify-center rounded-lg border border-surface-line bg-white p-2 text-ink-muted transition hover:border-brand/40"
          >
            <RefreshIcon className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            <PlusIcon className="h-4 w-4" /> New post
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {STATUSES.map((status) => {
          const cards = visiblePosts.filter((p) => p.status === status);
          const s = STATUS_STYLE[status];
          const isOver = overCol === status;
          return (
            <section
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(status);
              }}
              onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
              onDrop={() => onDrop(status)}
              className={`flex max-h-[calc(100vh-190px)] flex-col rounded-xl border bg-surface-sunk transition ${
                isOver ? "border-brand" : "border-surface-line"
              }`}
            >
              <div className="flex items-center gap-2 px-3 pb-2 pt-3">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                <h2 className="text-sm font-semibold text-ink-muted">{STATUS_LABEL[status]}</h2>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${s.pill}`}>
                  {cards.length}
                </span>
              </div>

              <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
                {cards.map((p) => (
                  <article
                    key={p.id}
                    draggable
                    onDragStart={() => setDragId(p.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                    onPointerDown={(e) => {
                      pressPos.current = { x: e.clientX, y: e.clientY };
                    }}
                    onClick={(e) => {
                      const s = pressPos.current;
                      pressPos.current = null;
                      if (!s) return;
                      // ignore if the pointer moved (i.e. it was a drag)
                      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) setEditing(p);
                    }}
                    className={`group shrink-0 cursor-pointer overflow-hidden rounded-lg border border-surface-line bg-surface-card transition hover:border-slate-300 active:cursor-grabbing ${
                      dragId === p.id ? "opacity-50" : ""
                    }`}
                  >
                    <CardImages urls={p.media_urls} />

                    <div className="p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <PlatformIcon platform={p.platform} className="h-4 w-4" />
                        {fmtDate(p.scheduled_at) && (
                          <span className="text-[11px] text-ink-subtle">
                            {fmtDate(p.scheduled_at)}
                          </span>
                        )}
                        {(p.sources?.length ?? 0) > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] text-ink-subtle"
                            title={`${p.sources.length} source${p.sources.length > 1 ? "s" : ""}`}
                          >
                            <LinkIcon className="h-3 w-3" />
                            {p.sources.length}
                          </span>
                        )}
                        <SourceBadge source={p.source} />
                      </div>

                      <p className="mb-3 whitespace-pre-wrap text-sm leading-snug text-ink-muted line-clamp-5">
                        {p.content}
                      </p>

                      <div
                        className="flex items-center gap-1 border-t border-surface-line pt-2"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconBtn
                          label={copiedId === p.id ? "Copied!" : "Copy text"}
                          onClick={() => copy(p)}
                        >
                          {copiedId === p.id ? (
                            <CheckIcon className="h-4 w-4 text-grass" />
                          ) : (
                            <CopyIcon className="h-4 w-4" />
                          )}
                        </IconBtn>
                        {/* {p.status !== "cancelled" && (
                          <IconBtn
                            label="Cancel"
                            onClick={() => changeStatus(p.id, "cancelled")}
                          >
                            <BanIcon className="h-4 w-4" />
                          </IconBtn>
                        )} */}
                        <IconBtn
                          label="Delete"
                          danger
                          className="ml-auto"
                          onClick={() => {
                            if (confirm("Delete this post permanently?")) removePost(p.id);
                          }}
                        >
                          <TrashIcon className="h-4 w-4 text-danger" />
                        </IconBtn>
                      </div>
                    </div>
                  </article>
                ))}

                {cards.length === 0 && (
                  <p className="rounded-lg border border-dashed border-surface-line py-6 text-center text-xs text-ink-subtle">
                    Drop posts here
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {showDocs && <DocsPanel isMock={isMock} onClose={() => setShowDocs(false)} />}

      {(creating || editing) && (
        <PostPanel
          post={editing ?? undefined}
          isMock={isMock}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onShowHistory={editing ? () => setHistory(editing) : undefined}
          onSubmit={async (data) => {
            const res = editing
              ? await updatePost(editing.id, {
                  content: data.content,
                  scheduled_at: data.scheduled_at,
                  media_urls: data.media_urls,
                  sources: data.sources,
                })
              : await createPost({
                  id: data.postId,
                  platform: data.platform,
                  content: data.content,
                  scheduled_at: data.scheduled_at,
                  media_urls: data.media_urls,
                  sources: data.sources,
                });
            if (res.ok) router.refresh();
            return res;
          }}
        />
      )}

      {history && (
        <HistoryModal
          post={history}
          onClose={() => setHistory(null)}
          onRestore={(snap) =>
            run(async () => {
              const res = await updatePost(history.id, {
                content: snap.content,
                media_urls: snap.media_urls,
              });
              if (res.ok) {
                setHistory(null);
                setEditing(null);
              }
              return res;
            })
          }
        />
      )}
    </div>
  );
}

/* ---------- card image gallery ---------- */

function CardImages({ urls }: { urls: string[] }) {
  if (!urls || urls.length === 0) return null;
  const countPill =
    urls.length > 1 ? (
      <span className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {urls.length} images
      </span>
    ) : null;

  if (urls.length === 1) {
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[0]} alt="" loading="lazy" className="h-32 w-full object-cover" />
      </div>
    );
  }
  const shown = urls.slice(0, 4);
  const extra = urls.length - shown.length;
  return (
    <div className="relative">
      {countPill}
      <div className="grid grid-cols-2 gap-0.5">
        {shown.map((u, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" loading="lazy" className="h-20 w-full object-cover" />
            {i === 3 && extra > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-ink/50 text-sm font-semibold text-white">
                +{extra}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- activity history ---------- */

type Ev =
  | {
      kind: "content";
      id: string;
      at: string;
      by: string | null;
      before: string;
      after: string;
      beforeMedia: string[];
      afterMedia: string[];
    }
  | {
      kind: "status";
      id: string;
      at: string;
      by: string | null;
      from: PostStatus | null;
      to: PostStatus | null;
    };

function HistoryModal({
  post,
  onClose,
  onRestore,
}: {
  post: Post;
  onClose: () => void;
  onRestore: (snap: { content: string; media_urls: string[] }) => void;
}) {
  const [activity, setActivity] = useState<PostActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPostEdits(post.id)
      .then(setActivity)
      .finally(() => setLoading(false));
  }, [post.id]);

  const fmt = (d: string) =>
    new Date(d).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  // Content edits (newest first). Each 'edit' row holds the version BEFORE it;
  // the version AFTER it is the next-newer edit's content, or the current post.
  const contentRows = activity.filter((a) => a.kind !== "status");
  const contentEvents: Ev[] = contentRows.map((row, i) => {
    const newer =
      i === 0
        ? { content: post.content, media_urls: post.media_urls }
        : { content: contentRows[i - 1].content ?? "", media_urls: contentRows[i - 1].media_urls };
    return {
      kind: "content",
      id: row.id,
      at: row.edited_at,
      by: row.edited_by,
      before: row.content ?? "",
      after: newer.content,
      beforeMedia: row.media_urls,
      afterMedia: newer.media_urls,
    };
  });

  const statusEvents: Ev[] = activity
    .filter((a) => a.kind === "status")
    .map((a) => ({
      kind: "status",
      id: a.id,
      at: a.edited_at,
      by: a.edited_by,
      from: a.from_status,
      to: a.to_status,
    }));

  const events = [...contentEvents, ...statusEvents].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-surface-line bg-surface-card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Activity</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-sunk hover:text-ink"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <p className="py-4 text-center text-sm text-ink-subtle">Loading activity…</p>
        )}
        {!loading && events.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-subtle">No changes yet.</p>
        )}

        <ol className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id} className="rounded-lg border border-surface-line p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-subtle">
                <span className="font-semibold text-ink">{e.by ?? "Someone"}</span>
                <span>{e.kind === "content" ? "edited the post" : "changed status"}</span>
                <span>· {fmt(e.at)}</span>
                {e.kind === "content" && (
                  <button
                    onClick={() =>
                      onRestore({ content: e.before, media_urls: e.beforeMedia })
                    }
                    className="ml-auto font-semibold text-brand hover:underline"
                  >
                    Restore this version
                  </button>
                )}
              </div>

              {e.kind === "status" ? (
                <div className="flex items-center gap-2">
                  <StatusPill status={e.from} />
                  <span className="text-ink-subtle">→</span>
                  <StatusPill status={e.to} />
                </div>
              ) : (
                <>
                  {e.before !== e.after ? (
                    <DiffText parts={diffWords(e.before, e.after)} />
                  ) : (
                    <p className="text-xs italic text-ink-subtle">Images updated</p>
                  )}
                  <ImageDiff prev={e.beforeMedia} cur={e.afterMedia} />
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: PostStatus | null }) {
  if (!status) return <span className="text-xs text-ink-subtle">—</span>;
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function DiffText({ parts }: { parts: DiffPart[] }) {
  // Collapse long unchanged runs so the eye lands on what actually changed.
  const compact = (v: string) => (v.length > 70 ? `${v.slice(0, 30)} … ${v.slice(-30)}` : v);
  return (
    <p className="whitespace-pre-wrap text-sm leading-snug text-ink-muted">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{compact(p.value)}</span>
        ) : p.type === "add" ? (
          <span key={i} className="rounded-sm bg-grass-soft text-grass-ink">
            {p.value}
          </span>
        ) : (
          <span key={i} className="rounded-sm bg-danger-soft text-danger line-through">
            {p.value}
          </span>
        ),
      )}
    </p>
  );
}

function ImageDiff({ prev, cur }: { prev: string[] | null; cur: string[] }) {
  if (prev === null) {
    if (cur.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {cur.slice(0, 8).map((u, j) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={j} src={u} alt="" className="h-10 w-10 rounded border border-surface-line object-cover" />
        ))}
      </div>
    );
  }

  const { kept, added, removed } = diffImages(prev, cur);
  if (kept.length + added.length + removed.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {removed.map((u, j) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`r${j}`}
          src={u}
          alt=""
          title="removed"
          className="h-10 w-10 rounded object-cover opacity-50 ring-2 ring-danger"
        />
      ))}
      {kept.map((u, j) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`k${j}`} src={u} alt="" className="h-10 w-10 rounded border border-surface-line object-cover" />
      ))}
      {added.map((u, j) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`a${j}`}
          src={u}
          alt=""
          title="added"
          className="h-10 w-10 rounded object-cover ring-2 ring-grass"
        />
      ))}
    </div>
  );
}

/* ---------- small icon button ---------- */

function IconBtn({
  label,
  onClick,
  children,
  danger,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded-md p-1.5 transition ${
        danger
          ? "text-ink-subtle hover:bg-danger-soft hover:text-danger"
          : "text-ink-subtle hover:bg-surface-sunk hover:text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------- modal ---------- */

const inputCls =
  "w-full rounded-lg border border-surface-line bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

type ModalData = {
  postId: string;
  platform: Platform;
  content: string;
  scheduled_at: string | null;
  media_urls: string[];
  sources: Source[];
};

function PostPanel({
  post,
  isMock,
  onClose,
  onShowHistory,
  onSubmit,
}: {
  post?: Post;
  isMock: boolean;
  onClose: () => void;
  onShowHistory?: () => void;
  onSubmit: (data: ModalData) => Promise<ActionResult>;
}) {
  // Stable id for this post — existing id, or a new one used as the storage folder.
  const [draftId] = useState(() => post?.id ?? crypto.randomUUID());
  const [platform, setPlatform] = useState<Platform>(post?.platform ?? "linkedin");
  const [content, setContent] = useState(post?.content ?? "");
  const [date, setDate] = useState(post?.scheduled_at ? post.scheduled_at.slice(0, 10) : "");
  const [images, setImages] = useState<string[]>(post?.media_urls ?? []);
  const [url, setUrl] = useState("");
  const [sources, setSources] = useState<Source[]>(post?.sources ?? []);
  const [srcUrl, setSrcUrl] = useState("");
  const [srcTitle, setSrcTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const historyCount = post?.edit_count ?? 0;

  function addUrl() {
    const u = url.trim();
    if (u) setImages((prev) => [...prev, u]);
    setUrl("");
  }

  function addSource() {
    const u = srcUrl.trim();
    if (!u) return;
    setSources((prev) => [...prev, { url: u, title: srcTitle.trim() || undefined }]);
    setSrcUrl("");
    setSrcTitle("");
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      // Mock: inline as data URLs. Real: stage into tmp/{draftId}/ in storage.
      const urls = isMock
        ? await filesToDataUrls(e.target.files)
        : await uploadImagesToTmp(draftId, e.target.files);
      setImages((prev) => [...prev, ...urls]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    const res = await onSubmit({
      postId: draftId,
      platform,
      content,
      scheduled_at: date ? new Date(date).toISOString() : null,
      media_urls: images,
      sources,
    });
    setSaving(false);
    if (res.ok) {
      savedRef.current = true;
      onClose();
    } else {
      setSaveError(res.error ?? "Couldn't save");
    }
  }

  // Closing without saving discards any images staged in tmp/{draftId}/.
  function handleClose() {
    if (!savedRef.current && !isMock) void discardDraft(draftId);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/30" onClick={handleClose} />
      <aside className="panel-in relative flex h-full w-full flex-col border-l border-surface-line bg-surface-card shadow-elevated sm:w-[42%] sm:min-w-[420px]">
        <header className="flex items-center gap-2 border-b border-surface-line px-5 py-4">
          {post ? (
            <PlatformIcon platform={post.platform} className="h-5 w-5" />
          ) : (
            <PlusIcon className="h-5 w-5 text-brand" />
          )}
          <h2 className="text-base font-semibold text-ink">
            {post ? "Post details" : "New post"}
          </h2>
          <div className="ml-auto flex items-center gap-1">
            {post && onShowHistory && (
              <IconBtn
                label={historyCount > 0 ? "Activity & edit history" : "No edits yet"}
                onClick={onShowHistory}
              >
                <span className="relative inline-flex">
                  <HistoryIcon className="h-5 w-5" />
                  {historyCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 rounded-full bg-brand px-1 text-[9px] font-semibold leading-tight text-white">
                      {historyCount}
                    </span>
                  )}
                </span>
              </IconBtn>
            )}
            <IconBtn label="Close" onClick={handleClose}>
              <CloseIcon className="h-5 w-5" />
            </IconBtn>
          </div>
        </header>

        <div className="scroll-slim flex-1 overflow-y-auto px-5 py-4">
        {!post && (
          <>
            <label className="mb-1 block text-sm font-medium text-ink">Platform</label>
            <div className="mb-4 flex gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                    platform === p
                      ? "border-brand bg-brand-soft text-brand-dark"
                      : "border-surface-line text-ink-muted hover:border-brand/40"
                  }`}
                >
                  <PlatformIcon platform={p} className="h-4 w-4" />
                  {PLATFORM_LABEL[p]}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="mb-1 block text-sm font-medium text-ink">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          placeholder="Write the post…"
          className={`mb-4 ${inputCls}`}
        />

        <label className="mb-1 block text-sm font-medium text-ink">Images</label>
        {images.length > 0 && (
          <div className="mb-3 grid grid-cols-4 gap-2">
            {images.map((u, i) => (
              <div key={i} className="group relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u}
                  alt=""
                  className="h-full w-full rounded-md border border-surface-line object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-2 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUrl())}
            placeholder="Paste an image URL…"
            className={inputCls}
          />
          <button
            type="button"
            onClick={addUrl}
            className="shrink-0 rounded-lg border border-surface-line px-3 py-2 text-sm font-medium text-ink-muted hover:border-brand/40"
          >
            Add
          </button>
        </div>
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload from device"}
          </button>
          {uploadError && <span className="text-xs text-danger">{uploadError}</span>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onFiles}
          className="hidden"
        />

        <label className="mb-1 block text-sm font-medium text-ink">Sources</label>
        {sources.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1.5">
            {sources.map((s, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-surface-line bg-white px-3 py-2"
              >
                <LinkIcon className="h-4 w-4 shrink-0 text-ink-subtle" />
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-brand hover:underline"
                  title={s.url}
                >
                  {s.title || s.url}
                </a>
                <button
                  type="button"
                  onClick={() => setSources((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Remove source"
                  className="shrink-0 rounded-md p-1 text-ink-subtle hover:bg-danger-soft hover:text-danger"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mb-5 flex flex-col gap-2">
          <input
            value={srcTitle}
            onChange={(e) => setSrcTitle(e.target.value)}
            placeholder="Title (optional) — e.g. BrightLocal 2025 survey"
            className={inputCls}
          />
          <div className="flex gap-2">
            <input
              value={srcUrl}
              onChange={(e) => setSrcUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSource())}
              placeholder="https://source-url…"
              className={inputCls}
            />
            <button
              type="button"
              onClick={addSource}
              className="shrink-0 rounded-lg border border-surface-line px-3 py-2 text-sm font-medium text-ink-muted hover:border-brand/40"
            >
              Add
            </button>
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium text-ink">Schedule date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`${inputCls}`}
        />
        </div>

        <footer className="border-t border-surface-line px-5 py-4">
          {saveError && <p className="mb-2 text-sm text-danger">{saveError}</p>}
          <div className="flex justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={saving}
              className="rounded-lg border border-surface-line px-4 py-2 text-sm font-medium text-ink-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || uploading}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : post ? "Save changes" : "Create"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
