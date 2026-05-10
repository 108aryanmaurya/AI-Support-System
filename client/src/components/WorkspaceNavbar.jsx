import { Link, useLocation, useParams } from 'react-router-dom'
import { OrgSwitcher } from './OrgSwitcher.jsx'

function navClass(active) {
  return `rounded-md px-2 py-1 transition hover:bg-[#1a2238] ${
    active ? 'font-semibold text-white' : 'text-slate-400 hover:text-white'
  }`
}

/**
 * Top bar for org-scoped routes (inbox, settings). Keeps workspace switcher visible without full reload.
 */
export function WorkspaceNavbar() {
  const { orgId } = useParams()
  const { pathname } = useLocation()
  const onInbox = pathname.endsWith('/inbox')
  const onSettings = pathname.includes('/settings')

  return (
    <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-[#27314a] bg-[#0f1422]/95 px-3 backdrop-blur-md md:h-12 md:px-4">
      <OrgSwitcher />
      <nav className="flex shrink-0 items-center gap-2 text-xs md:text-sm" aria-label="Workspace">
        <Link to={`/org/${orgId}/inbox`} className={navClass(onInbox)}>
          Inbox
        </Link>
        <Link to={`/org/${orgId}/settings`} className={navClass(onSettings)}>
          Settings
        </Link>
      </nav>
    </header>
  )
}
