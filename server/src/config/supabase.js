import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Admin client with service role — use only on the server.
 * Never send this key to the frontend or expose it in client bundles.
 */
export const supabaseAdmin = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
