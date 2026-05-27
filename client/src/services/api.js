/**
 * Call the Express API with the current Supabase access token (when logged in).
 */
import { supabase } from './supabase.js'

const base = import.meta.env.VITE_API_URL ?? ''

export async function apiFetch(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  const res = await fetch(`${base}${path}`, { ...options, headers })
  if (!res.ok) {
    const text = await res.text()
    let err
    try {
      err = JSON.parse(text)
    } catch {
      err = { error: text || res.statusText }
    }
    throw Object.assign(new Error(err.error || 'Request failed'), {
      status: res.status,
      code: err.code ?? null,
      body: err,
    })
  }
  return res.json()
}
