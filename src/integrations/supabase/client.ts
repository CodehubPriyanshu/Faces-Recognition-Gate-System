// Supabase client — browser & SSR (publishable / anon key only).
// Uses the centralized env utility to read credentials from .env.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getSupabaseClientEnv } from '@/lib/env';

function createSupabaseClient() {
  const { url, anonKey } = getSupabaseClientEnv();

  return createClient<Database>(url, anonKey, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
