import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see client/.env.example)',
  )
}
const supabase = createClient(url ?? '', anonKey ?? '')
if (typeof window !== 'undefined') {
  (window).supabase = supabase;
  console.log('supabase', window.supabase)
}
/**
 * Browser-side Supabase client — anon key only. Never put the service role key here.
 */
export { supabase }
