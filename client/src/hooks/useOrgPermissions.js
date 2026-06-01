import { useCallback, useEffect, useState } from 'react'
import { hasOrgPermission } from '@ai-support/shared'
import { apiFetch } from '../services/api.js'

/**
 * Effective org capabilities for the signed-in user in the workspace from the URL (`orgId`).
 * Reloads when `orgId` changes (org switch).
 *
 * @param {string | null | undefined} orgId — `/org/:orgId/...`
 */
export function useOrgPermissions(orgId) {
  const [permissions, setPermissions] = useState(null)
  const [memberPermissions, setMemberPermissions] = useState(null)
  const [membershipId, setMembershipId] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!orgId) {
      setPermissions(null)
      setMemberPermissions(null)
      setMembershipId(null)
      setRole(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch(`/api/org/${encodeURIComponent(orgId)}/members/me`)
      setPermissions(data?.permissions ?? null)
      setMemberPermissions(data?.memberPermissions ?? null)
      setMembershipId(data?.membershipId ?? null)
      setRole(data?.role ?? null)
    } catch (e) {
      setPermissions(null)
      setMemberPermissions(null)
      setMembershipId(null)
      setRole(null)
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const can = useCallback((key) => hasOrgPermission(permissions, key), [permissions])

  return {
    permissions,
    memberPermissions,
    membershipId,
    role,
    loading,
    error,
    refresh,
    can,
  }
}
