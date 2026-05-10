import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../services/api.js'
import { useAuthContext } from './AuthContext.jsx'

/**
 * @typedef {{ orgId: string, name: string, role: string | null, membershipId: string | null, status: string | null, raw: unknown }} UserOrganization
 */

const OrganizationContext = createContext(null)

function normalizeMembership(entry) {
  const org = entry?.organization ?? entry
  const orgId = org?.id != null ? String(org.id) : null
  return {
    orgId,
    name: typeof org?.name === 'string' && org.name.trim() ? org.name : 'Workspace',
    role: entry?.role ?? null,
    membershipId: entry?.membershipId ?? entry?.id ?? null,
    status: entry?.status ?? null,
    raw: entry,
  }
}

export function OrganizationProvider({ children }) {
  const { user, loading: authLoading } = useAuthContext()
  const [organizations, setOrganizations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setOrganizations([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/api/org/my')
      const rows = Array.isArray(data?.organizations) ? data.organizations : []
      const next = rows.map(normalizeMembership).filter((o) => o.orgId)
      setOrganizations(next)
    } catch (e) {
      setOrganizations([])
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (authLoading) return
    void refresh()
  }, [authLoading, refresh])

  const isMemberOf = useCallback(
    (orgId) => {
      if (!orgId) return false
      return organizations.some((o) => o.orgId === orgId)
    },
    [organizations],
  )

  const value = useMemo(
    () => ({
      organizations,
      /** True while auth or org list is loading */
      loading: authLoading || loading,
      orgLoading: loading,
      error,
      refresh,
      isMemberOf,
    }),
    [organizations, authLoading, loading, error, refresh, isMemberOf],
  )

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}

export function useOrganizationContext() {
  const ctx = useContext(OrganizationContext)
  if (!ctx) {
    throw new Error('useOrganizationContext must be used within OrganizationProvider')
  }
  return ctx
}
