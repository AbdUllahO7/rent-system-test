import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Polyfill dummy WebSocket if missing in Node < 22 environments to prevent realtime-js crashes
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = class {};
}

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables");
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const getServiceRoleSupabase = createAdminClient;

