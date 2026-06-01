import { useOrgPermissionsContextOptional } from '../context/OrgPermissionsContext.jsx'

/**
 * Whether the current user may change workspace settings in the active org (from URL).
 *
 * @param {string | null | undefined} _orgId — reserved; scope comes from OrgPermissionsProvider
 * @returns {boolean}
 */
export function useWorkspaceCanManage(_orgId) {
  const perms = useOrgPermissionsContextOptional()
  if (!perms || perms.loading) return false
  return (
    perms.can('team.configure_permissions') ||
    perms.can('automation.manage_assignment') ||
    perms.can('ai.manage_settings')
  )
}
