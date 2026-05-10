import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Building2, ChevronDown, Check } from 'lucide-react'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { setLastOrgId } from '../utils/lastOrgStorage.js'

/**
 * Lists every workspace the user belongs to; switching updates `last_org_id` and SPA-navigates (no reload).
 */
export function OrgSwitcher({ className = '' }) {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { organizations, loading } = useOrganizationContext()

  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  const sorted = useMemo(() => {
    return [...organizations].sort((a, b) => a.name.localeCompare(b.name))
  }, [organizations])

  const current = sorted.find((o) => o.orgId === orgId) ?? sorted[0]

  useEffect(() => {
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    if (open) {
      document.addEventListener('pointerdown', onPointerDown)
      return () => document.removeEventListener('pointerdown', onPointerDown)
    }
    return undefined
  }, [open])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }
    return undefined
  }, [open])

  function select(nextId) {
    if (nextId === orgId) {
      setOpen(false)
      return
    }
    setLastOrgId(nextId)
    navigate(`/org/${nextId}/inbox`, { replace: false })
    setOpen(false)
  }

  const label = loading && sorted.length === 0 ? 'Loading…' : current?.name ?? 'Workspace'

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={sorted.length === 0 && !loading}
        className="flex max-w-[min(100vw-8rem,14rem)] items-center gap-2 rounded-lg border border-[#334060] bg-[#151b2e] px-2.5 py-1.5 text-left text-sm font-medium text-white shadow-sm transition hover:border-[#3ECF8E]/35 hover:bg-[#1a2238] disabled:opacity-60 md:max-w-[16rem]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Building2 size={16} className="shrink-0 text-[#3ECF8E]/90" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && sorted.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-[min(60vh,20rem)] w-[min(calc(100vw-2rem),18rem)] overflow-auto rounded-xl border border-[#334060] bg-[#151b2e] py-1 shadow-xl"
        >
          {sorted.map((o) => {
            const active = o.orgId === orgId
            return (
              <li key={o.orgId} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => select(o.orgId)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                    active ? 'bg-[#1f2d4a] text-white' : 'text-slate-200 hover:bg-[#1a2238]'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                  {active ? <Check size={14} className="shrink-0 text-[#3ECF8E]" aria-hidden /> : null}
                  {o.role ? (
                    <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                      {o.role}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
