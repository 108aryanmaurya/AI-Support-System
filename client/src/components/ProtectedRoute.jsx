import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthContext } from '../context/AuthContext.jsx'

/**
 * Requires a Supabase session. Renders child routes via `<Outlet />`.
 * Redirects unauthenticated users to `/login`, preserving the attempted location.
 */
export function RequireAuth() {
  const { user, loading } = useAuthContext()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">
        Loading session…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

/** Alias for documentation / consumer preference */
export const ProtectedRoute = RequireAuth
