import { createClient } from "@supabase/supabase-js";

// Service-role client for the push API only. Bypasses RLS.
// NEVER import this into client components.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
