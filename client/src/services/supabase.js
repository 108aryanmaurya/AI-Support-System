import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see client/.env.example)',
  )
}

/**
 * Browser-side Supabase client — anon key only. Never put the service role key here.
 */
export const supabase = createClient(url ?? '', anonKey ?? '')
