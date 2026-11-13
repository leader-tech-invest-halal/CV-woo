"use client";

import { createBrowserClient } from "@supabase/ssr";

// Client Supabase du navigateur : uniquement la clé publique (publishable), jamais la clé secrète.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
