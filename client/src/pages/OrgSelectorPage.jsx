import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo.jsx'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { setLastOrgId } from '../utils/lastOrgStorage.js'

export default function OrgSelectorPage() {
  const { organizations, loading } = useOrganizationContext()
  const navigate = useNavigate()

  function choose(orgId) {
    setLastOrgId(orgId)
    navigate(`/org/${orgId}/inbox`, { replace: true })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1020] text-slate-300">
        Loading organizations…
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#0b1020] px-6 py-14 text-slate-100">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-10 flex justify-center">
          <Logo variant="dark" />
        </div>
        <h1 className="text-center text-2xl font-semibold tracking-tight text-white">Choose a workspace</h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          Select an organization to open the inbox. You can switch workspaces anytime.
        </p>

        <ul className="mt-10 space-y-3">
          {organizations.map((o) => (
            <li key={o.orgId}>
              <button
                type="button"
                onClick={() => choose(o.orgId)}
                className="flex w-full items-center justify-between rounded-xl border border-[#2b3858] bg-[#151b2e] px-4 py-4 text-left text-sm font-medium text-white transition hover:border-[#3ECF8E]/50 hover:bg-[#1a2238]"
              >
                <span>{o.name}</span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-normal uppercase text-slate-300">
                  {o.role ?? 'member'}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => navigate('/onboarding', { replace: true })}
          className="mt-8 w-full rounded-xl border border-dashed border-slate-600 py-3 text-sm text-slate-400 transition hover:border-[#3ECF8E]/40 hover:text-slate-200"
        >
          Create another workspace
        </button>
      </div>
    </main>
  )
}
