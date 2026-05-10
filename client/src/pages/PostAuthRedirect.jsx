import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../context/AuthContext.jsx'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { getLastOrgId, setLastOrgId } from '../utils/lastOrgStorage.js'

/**
 * After login / registration: loads org membership and routes to onboarding,
 * a single workspace inbox, org picker, or restores `last_org_id` when valid.
 */
export default function PostAuthRedirect() {
  const { user, loading: authLoading } = useAuthContext()
  const { organizations, loading: orgLoading, isMemberOf } = useOrganizationContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (authLoading || orgLoading) return
    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    const last = getLastOrgId()
    if (last && isMemberOf(last)) {
      navigate(`/org/${last}/inbox`, { replace: true })
      return
    }

    if (organizations.length === 0) {
      navigate('/onboarding', { replace: true })
      return
    }

    if (organizations.length === 1) {
      const id = organizations[0].orgId
      setLastOrgId(id)
      navigate(`/org/${id}/inbox`, { replace: true })
      return
    }

    navigate('/select-org', { replace: true })
  }, [user, authLoading, orgLoading, organizations, isMemberOf, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#0b1020] text-slate-200">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3ECF8E]/30 border-t-[#3ECF8E]" />
      <p className="text-sm text-slate-400">Opening your workspace…</p>
    </div>
  )
}
