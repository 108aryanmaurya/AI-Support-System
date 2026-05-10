import { Navigate } from 'react-router-dom'
import { getLastOrgId } from '../utils/lastOrgStorage.js'

/** Redirects `/teammates/invite/new` → last-used org invite flow (requires auth). */
export default function TeammatesInviteDeepLink() {
  const id = getLastOrgId()
  if (!id) return <Navigate to="/continue" replace />
  return <Navigate to={`/org/${id}/settings/teammates/invite/new`} replace />
}
