import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses the anon key and is subject to RLS.
 * Safe to use in Client Components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
