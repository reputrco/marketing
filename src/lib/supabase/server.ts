import { CookieOptions, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Session-aware client for server components / server actions.
// Respects Row Level Security via the logged-in user's cookies.
// cookies() is async in Next.js 16.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // @ts-ignore
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — safe to ignore, middleware refreshes.
          }
        },
      },
    },
  );
}
