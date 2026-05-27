import { createContext, useContext, useMemo } from 'react'
import { hasOrgPermission } from '@ai-support/shared'
import { useOrgPermissions } from '../hooks/useOrgPermissions.js'
import { permissionDenialMessage } from '../lib/permissionUx.js'

const OrgPermissionsContext = createContext(null)

export function OrgPermissionsProvider({ orgId, children }) {
  const { permissions, role, loading, error, refresh } = useOrgPermissions(orgId)

  const value = useMemo(() => {
    const can = (key) => hasOrgPermission(permissions, key)
    const deny = (key) => (can(key) ? null : permissionDenialMessage(key))
    return {
      permissions,
      role,
      loading,
      error,
      refresh,
      can,
      deny,
      isAdmin: String(role ?? '').toUpperCase() === 'ADMIN',
    }
  }, [permissions, role, loading, error, refresh])

  return <OrgPermissionsContext.Provider value={value}>{children}</OrgPermissionsContext.Provider>
}

export function useOrgPermissionsContext() {
  const ctx = useContext(OrgPermissionsContext)
  if (!ctx) {
    throw new Error('useOrgPermissionsContext must be used within OrgPermissionsProvider')
  }
  return ctx
}

/** Safe when provider is absent (returns permissive stubs). */
export function useOrgPermissionsContextOptional() {
  return useContext(OrgPermissionsContext)
}
