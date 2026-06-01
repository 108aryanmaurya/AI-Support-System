import { createContext, useContext, useMemo } from 'react'
import { permissionDenialMessage } from '../lib/permissionUx.js'
import { useOrgPermissions } from '../hooks/useOrgPermissions.js'

const OrgPermissionsContext = createContext(null)

export function OrgPermissionsProvider({ orgId, children }) {
  const {
    permissions,
    memberPermissions,
    membershipId,
    role,
    loading,
    error,
    refresh,
    can: canPermission,
  } = useOrgPermissions(orgId)

  const value = useMemo(() => {
    const can = (key) => canPermission(key)
    const deny = (key) => (can(key) ? null : permissionDenialMessage(key))
    const isAdmin =
      can('team.configure_permissions') ||
      can('team.manage_members') ||
      can('team.invite')

    return {
      permissions,
      memberPermissions,
      membershipId,
      role,
      loading,
      error,
      refresh,
      can,
      deny,
      isAdmin,
    }
  }, [
    permissions,
    memberPermissions,
    membershipId,
    role,
    loading,
    error,
    refresh,
    canPermission,
  ])

  return <OrgPermissionsContext.Provider value={value}>{children}</OrgPermissionsContext.Provider>
}

export function useOrgPermissionsContext() {
  const ctx = useContext(OrgPermissionsContext)
  if (!ctx) {
    throw new Error('useOrgPermissionsContext must be used within OrgPermissionsProvider')
  }
  return ctx
}

/** Safe when provider is absent (returns null). */
export function useOrgPermissionsContextOptional() {
  return useContext(OrgPermissionsContext)
}
