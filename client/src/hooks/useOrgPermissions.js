import { useCallback, useEffect, useState } from 'react'
import { hasOrgPermission } from '@ai-support/shared'
import { apiFetch } from '../services/api.js'

/**
 * Effective org capabilities for the active workspace (server role preset ⊕ overrides).
 *
 * @param {string | null | undefined} orgId
 */
export function useOrgPermissions(orgId) {
  const [permissions, setPermissions] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!orgId) {
      setPermissions(null)
      setRole(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch(`/api/org/${encodeURIComponent(orgId)}/settings/permissions`)
      setPermissions(data?.permissions ?? null)
      setRole(data?.role ?? null)
    } catch (e) {
      setPermissions(null)
      setRole(null)
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const can = useCallback(
    (key) => hasOrgPermission(permissions, key),
    [permissions],
  )

  return { permissions, role, loading, error, refresh, can }
}
