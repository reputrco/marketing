import { createClient } from "@/lib/supabase/server";
import { IS_MOCK, mockPosts } from "@/lib/mock";
import { LogoutIcon } from "@/components/icons";
import { signOut } from "./dashboard/actions";
import Board from "./dashboard/Board";
import type { Post } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let posts: Post[] = [];
  let userEmail: string | undefined;
  let error: { message: string } | null = null;

  if (IS_MOCK) {
    posts = mockPosts();
    userEmail = "demo@reputr.io (mock)";
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email;

    const res = await supabase
      .from("posts")
      .select("*")
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    posts = (res.data ?? []) as Post[];
    error = res.error;
  }

  return (
    <main className="mx-auto max-w-[1500px] px-6 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-mini.png" alt="Logo" className="h-10 w-10 object-contain" />
          <div>
            <h1 className="font-display text-xl font-bold text-ink">Content Portal</h1>
            <p className="text-sm text-ink-subtle">{posts.length} posts in the pipeline</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {IS_MOCK && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              Mock mode
            </span>
          )}

          <div className="flex items-center gap-2.5 rounded-full border border-surface-line bg-white py-1 pl-1 pr-1.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold uppercase text-brand-dark">
              {(userEmail?.trim()?.[0] ?? "?").toUpperCase()}
            </span>
            <span className="text-sm font-medium text-ink">{userEmail}</span>
            {!IS_MOCK && (
              <form action={signOut}>
                <button
                  type="submit"
                  title="Sign out"
                  aria-label="Sign out"
                  className="rounded-full p-1.5 text-ink-subtle transition hover:bg-danger-soft hover:text-danger"
                >
                  <LogoutIcon className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error.message}
        </p>
      )}

      <Board initialPosts={posts} isMock={IS_MOCK} />
    </main>
  );
}
