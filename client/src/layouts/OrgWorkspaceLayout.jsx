import { useEffect } from 'react'
import { Navigate, Outlet, useNavigate, useParams } from 'react-router-dom'
import { HoverSidebar } from '../components/HoverSidebar.jsx'
import { WorkspaceNavbar } from '../components/WorkspaceNavbar.jsx'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { OrgPermissionsProvider } from '../context/OrgPermissionsContext.jsx'
import { setLastOrgId } from '../utils/lastOrgStorage.js'

/**
 * Validates URL `orgId` against `/api/org/my` membership and persists last visited org.
 */
export function OrgWorkspaceLayout() {
  const { orgId } = useParams()
  const { loading, isMemberOf } = useOrganizationContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (orgId) setLastOrgId(orgId)
  }, [orgId])

  useEffect(() => {
    if (loading || !orgId) return
    if (!isMemberOf(orgId)) {
      navigate('/continue', { replace: true })
    }
  }, [loading, orgId, isMemberOf, navigate])

  if (!orgId) {
    return <Navigate to="/continue" replace />
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1020] text-sm text-slate-300">
        Loading workspace…
      </div>
    )
  }

  if (!isMemberOf(orgId)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1020] text-sm text-slate-300">
        Redirecting…
      </div>
    )
  }

  return (
    <OrgPermissionsProvider orgId={orgId}>
      <HoverSidebar />
      <div className="flex h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden pl-[72px] md:ml-0">
        <WorkspaceNavbar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
    </OrgPermissionsProvider>
  )
}
