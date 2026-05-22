/**
 * Centralized environment variable access for Supabase credentials.
 *
 * - Client-side: reads VITE_SUPABASE_* via import.meta.env (Vite build-time replacement)
 * - Server-side: reads SUPABASE_* via process.env
 *
 * No external cloud dependencies — all values come from the local .env file.
 */

// ---------------------------------------------------------------------------
// Client / SSR (publishable keys only — safe for the browser)
// ---------------------------------------------------------------------------

function readClientEnv() {
  // Vite injects VITE_* at build time into import.meta.env
  const url =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
    '';

  const anonKey =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    (typeof process !== 'undefined' && process.env?.SUPABASE_PUBLISHABLE_KEY) ||
    '';

  return { url, anonKey };
}

let _warnedClient = false;

/**
 * Returns { url, anonKey } for the Supabase public/anon client.
 * Throws if either variable is missing.
 */
export function getSupabaseClientEnv() {
  const { url, anonKey } = readClientEnv();

  if (!url || !anonKey) {
    const missing: string[] = [];
    if (!url) missing.push('VITE_SUPABASE_URL / SUPABASE_URL');
    if (!anonKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_PUBLISHABLE_KEY');

    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Please check your .env file.`;

    if (!_warnedClient) {
      console.error(`[Supabase] ${message}`);
      _warnedClient = true;
    }
    throw new Error(message);
  }

  return { url, anonKey };
}

// ---------------------------------------------------------------------------
// Server-only (service role key — NEVER expose to the browser)
// ---------------------------------------------------------------------------

let _warnedServer = false;

/**
 * Returns { url, serviceRoleKey } for the Supabase admin/service-role client.
 * Falls back to the publishable key if SUPABASE_SERVICE_ROLE_KEY is not set,
 * which means admin operations (e.g. user management) will not have elevated
 * privileges — but the app will still start without errors.
 */
export function getSupabaseServerEnv() {
  const url = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';

  if (!url) {
    const message = 'Missing SUPABASE_URL in environment. Please check your .env file.';
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  // If no service role key, fall back to publishable key with a one-time warning
  if (!serviceRoleKey) {
    if (!_warnedServer) {
      console.warn(
        '[Supabase] SUPABASE_SERVICE_ROLE_KEY is not set. ' +
        'Admin operations (user management) will use the publishable key and may lack elevated privileges. ' +
        'Add SUPABASE_SERVICE_ROLE_KEY to your .env file for full admin functionality.'
      );
      _warnedServer = true;
    }
    return { url, serviceRoleKey: publishableKey };
  }

  return { url, serviceRoleKey };
}
