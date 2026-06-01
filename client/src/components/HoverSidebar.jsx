import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  BookOpen,
  Check,
  ChevronRight,
  CircleUserRound,
  Cog,
  ContactRound,
  Home,
  Search,
  SquareChartGantt,
  Plus,
} from 'lucide-react'
import minifiedLogo from '../assets/minified_logo.png'
import { Logo } from './Logo'
import { useAuthContext } from '../context/AuthContext.jsx'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { useOrgPermissionsContextOptional } from '../context/OrgPermissionsContext.jsx'
import { RestrictedControl } from './RestrictedControl.jsx'
import { permissionDenialMessage } from '../lib/permissionUx.js'
import { logout } from '../services/auth.js'
import { setLastOrgId } from '../utils/lastOrgStorage.js'

const topItems = [
  { label: 'Inbox', icon: Home, path: 'inbox' },
  { label: 'Fin AI Agent', icon: Bot },
  { label: 'Knowledge', icon: BookOpen, path: 'knowledge' },
  { label: 'Reports', icon: SquareChartGantt, path: 'reports', permission: 'analytics.view_org' },
  { label: 'Outbound', icon: ArrowRight },
  { label: 'Contacts', icon: ContactRound },
]

const bottomItems = [
  { label: 'Search', icon: Search, path: 'search' },
  { label: 'Settings', icon: Cog },
  { label: 'Profile', icon: CircleUserRound },
]

function profileDisplayName(user) {
  const fn = typeof user?.user_metadata?.first_name === 'string' ? user.user_metadata.first_name.trim() : ''
  const ln = typeof user?.user_metadata?.last_name === 'string' ? user.user_metadata.last_name.trim() : ''
  const combined = `${fn} ${ln}`.trim()
  if (combined) return combined
  const email = typeof user?.email === 'string' ? user.email : ''
  if (email.includes('@')) return email.split('@')[0].replace(/[._]/g, ' ')
  return 'Profile'
}

function WorkspaceFlyout({ organizations, currentOrgId, onSelectWorkspace, onAddWorkspace }) {
  return (
    <div className="absolute left-full top-0 flex">
      <div className="w-1.5 shrink-0 self-stretch" aria-hidden />
      <div
        className="w-[240px] overflow-hidden rounded-xl border border-[#334060] bg-[#151b2e] py-2 shadow-2xl"
        role="menu"
        aria-label="Workspaces"
      >
      <ul className="max-h-52 overflow-y-auto py-0.5">
        {organizations.map((org) => {
          const active = org.orgId === currentOrgId
          return (
            <li key={org.orgId}>
              <button
                type="button"
                onClick={() => onSelectWorkspace(org.orgId)}
                className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition hover:bg-[#111a2f] ${
                  active ? 'font-medium text-[#e8926f]' : 'text-slate-200'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{org.name}</span>
                {active ? (
                  <Check className="h-4 w-4 shrink-0 text-[#e8926f]" strokeWidth={2.5} aria-hidden />
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-1 border-t border-[#2b3858] pt-1">
        <button
          type="button"
          onClick={onAddWorkspace}
          className="flex w-full px-4 py-2.5 text-left text-sm text-slate-200 transition hover:bg-[#111a2f]"
        >
          Add a new workspace…
        </button>
      </div>
      </div>
    </div>
  )
}

function ProfileMenuPopup({
  open,
  displayName,
  workspaceName,
  organizations,
  currentOrgId,
  awayMode,
  onAwayModeChange,
  onSelectWorkspace,
  onAddWorkspace,
  onLogout,
  workspaceMenuHover,
  onWorkspaceMenuHoverChange,
}) {
  if (!open) return null

  return (
    <div className="absolute bottom-0 left-full z-[60] flex">
      <div className="w-2 shrink-0 self-stretch" aria-hidden />
      <div
        className="w-[280px] overflow-visible rounded-xl border border-[#334060] bg-[#151b2e] py-2 shadow-2xl"
        role="menu"
        aria-label="Profile menu"
      >
      <div className="flex items-center gap-3 border-b border-[#2b3858] px-4 py-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1a2238] text-slate-300">
          <CircleUserRound className="h-6 w-6" aria-hidden />
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#151b2e] bg-[#3ECF8E]" />
        </span>
        <p className="min-w-0 truncate text-sm font-semibold text-white">{displayName}</p>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm text-slate-200 hover:bg-[#111a2f]">
        <span>Away mode</span>
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 rounded border-[#334060] bg-[#0f1728] accent-[#3ECF8E]"
          checked={awayMode}
          onChange={(e) => onAwayModeChange(e.target.checked)}
        />
      </label>

      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-[#111a2f]"
      >
        <span className="truncate">Theme: Match system</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      </button>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-[#111a2f]"
      >
        <span className="truncate">Language: English (US)</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      </button>

      <div
        className="relative"
        onMouseEnter={() => onWorkspaceMenuHoverChange(true)}
        onMouseLeave={() => onWorkspaceMenuHoverChange(false)}
      >
        <button
          type="button"
          className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition ${
            workspaceMenuHover ? 'bg-[#1c2640] text-white' : 'text-slate-200 hover:bg-[#111a2f]'
          }`}
        >
          <span className="truncate">Workspace: {workspaceName}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        </button>
        {workspaceMenuHover ? (
          <WorkspaceFlyout
            organizations={organizations}
            currentOrgId={currentOrgId}
            onSelectWorkspace={onSelectWorkspace}
            onAddWorkspace={onAddWorkspace}
          />
        ) : null}
      </div>

      <div className="mt-1 border-t border-[#2b3858] pt-1">
        <button
          type="button"
          className="flex w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-[#111a2f]"
        >
          Terms &amp; policies
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full px-4 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-[#111a2f]"
        >
          Log out
        </button>
      </div>
      </div>
    </div>
  )
}

export function HoverSidebar() {
  const hoverZoneRef = useRef(null)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [workspaceMenuHover, setWorkspaceMenuHover] = useState(false)
  const [awayMode, setAwayMode] = useState(false)

  const showExpandedPanel = sidebarExpanded || profileMenuOpen
  const navigate = useNavigate()
  const location = useLocation()
  const { orgId } = useParams()
  const perms = useOrgPermissionsContextOptional()
  const { user } = useAuthContext()
  const { organizations } = useOrganizationContext()

  const displayName = useMemo(() => profileDisplayName(user), [user])
  const workspaceName = useMemo(() => {
    const current = organizations.find((o) => o.orgId === orgId)
    return current?.name ?? 'Workspace'
  }, [organizations, orgId])
  const sortedOrgs = useMemo(
    () => [...organizations].sort((a, b) => a.name.localeCompare(b.name)),
    [organizations],
  )

  useEffect(() => {
    if (!profileMenuOpen) return undefined
    function onKey(e) {
      if (e.key === 'Escape') closeSidebarHover()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [profileMenuOpen])

  useEffect(() => {
    if (!showExpandedPanel && !profileMenuOpen) return undefined
    function onPointerDown(e) {
      const target = e.target
      if (target instanceof Node && hoverZoneRef.current?.contains(target)) return
      closeSidebarHover()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [showExpandedPanel, profileMenuOpen])

  function goToSettings() {
    if (orgId) navigate(`/org/${orgId}/settings`)
  }

  function goToWorkspacePath(segment) {
    if (orgId && segment) navigate(`/org/${orgId}/${segment}`)
  }

  function handleTopNav(item) {
    if (item.permission && perms && !perms.can(item.permission)) return
    if (item.path) goToWorkspacePath(item.path)
  }

  function itemRestricted(item) {
    if (!item.permission || !perms) return false
    return !perms.can(item.permission)
  }

  function itemRestrictedReason(item) {
    if (!item.permission) return null
    return permissionDenialMessage(item.permission)
  }

  function handleBottomNav(item) {
    if (item.label === 'Settings') goToSettings()
    else if (item.path) goToWorkspacePath(item.path)
  }

  function isActivePath(segment) {
    if (!segment || !orgId) return false
    return location.pathname.startsWith(`/org/${orgId}/${segment}`)
  }

  function selectWorkspace(nextId) {
    if (!nextId || nextId === orgId) return
    setLastOrgId(nextId)
    navigate(`/org/${nextId}/inbox`)
    closeSidebarHover()
  }

  function handleAddWorkspace() {
    closeSidebarHover()
    navigate('/onboarding')
  }

  async function handleLogout() {
    closeSidebarHover()
    await logout()
    navigate('/login', { replace: true })
  }

  function closeSidebarHover() {
    setSidebarExpanded(false)
    setProfileMenuOpen(false)
    setWorkspaceMenuHover(false)
  }

  function handleHoverZoneMouseLeave(e) {
    const related = e.relatedTarget
    if (related instanceof Node && hoverZoneRef.current?.contains(related)) return
    closeSidebarHover()
  }

  function renderExpandedProfileRow() {
    return (
      <div
        className="relative"
        onMouseEnter={() => {
          setSidebarExpanded(true)
          setProfileMenuOpen(true)
        }}
      >
        <button
          type="button"
          aria-expanded={profileMenuOpen}
          className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium text-white transition hover:bg-[#111a2f]"
        >
          <CircleUserRound size={18} className="text-white/95" />
          <span>Profile</span>
          <span className="ml-auto h-2 w-2 rounded-full bg-[#3ECF8E]" />
        </button>
        {profileMenuOpen ? (
          <ProfileMenuPopup
            open
            displayName={displayName}
            workspaceName={workspaceName}
            organizations={sortedOrgs}
            currentOrgId={orgId}
            awayMode={awayMode}
            onAwayModeChange={setAwayMode}
            onSelectWorkspace={selectWorkspace}
            onAddWorkspace={handleAddWorkspace}
            onLogout={() => void handleLogout()}
            workspaceMenuHover={workspaceMenuHover}
            onWorkspaceMenuHoverChange={setWorkspaceMenuHover}
          />
        ) : null}
      </div>
    )
  }

  return (
    <aside
      ref={hoverZoneRef}
      className="fixed left-0 top-0 z-50 h-screen w-[72px]"
      onMouseLeave={handleHoverZoneMouseLeave}
    >
      <div
        className="flex h-full w-[72px] flex-col items-center border-r border-[#1d253a] bg-black/95 py-4"
        onMouseEnter={() => setSidebarExpanded(true)}
      >
        <img src={minifiedLogo} alt="ResolveAI" className="w-20 object-contain" />
        <div className="mt-8 flex flex-1 flex-col items-center gap-5 text-white/95">
          {topItems.map((item) => {
            if (!item.path) {
              return <item.icon key={item.label} size={18} />
            }
            const restricted = itemRestricted(item)
            return (
              <RestrictedControl
                key={item.label}
                restricted={restricted}
                reason={itemRestrictedReason(item)}
              >
                <button
                  type="button"
                  onClick={() => handleTopNav(item)}
                  aria-label={item.label}
                  className="text-white/95 transition hover:text-white"
                >
                  <item.icon size={18} />
                </button>
              </RestrictedControl>
            )
          })}
        </div>
        <div className="mb-2 flex flex-col items-center gap-5 text-white/95">
          <button type="button">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-sm">
              <Plus size={14} />
            </span>
          </button>
          {bottomItems.map((item) => {
            if (item.label === 'Settings') {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={goToSettings}
                  aria-label="Settings"
                  className="text-white/95 transition hover:text-white"
                >
                  <item.icon size={18} />
                </button>
              )
            }
            if (item.label === 'Profile') {
              return (
                <span key={item.label} className="relative text-white/95" aria-hidden>
                  <CircleUserRound size={18} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-black bg-[#3ECF8E]" />
                </span>
              )
            }
            return <item.icon key={item.label} size={18} />
          })}
        </div>
      </div>

      <div
        className={`absolute left-0 top-0 flex h-screen w-[220px] flex-col overflow-visible border-r border-[#1d253a] bg-black/98 px-3 shadow-2xl transition-transform duration-200 md:flex ${
          showExpandedPanel ? 'translate-x-0' : 'pointer-events-none -translate-x-full'
        }`}
        onMouseEnter={() => setSidebarExpanded(true)}
      >
        <div className="px-2">
            <Logo variant="dark" />
          </div>

          <nav className="px-3 ">
            {topItems.map((item) => {
              const restricted = itemRestricted(item)
              const btn = (
                <button
                  type="button"
                  onClick={() => handleTopNav(item)}
                  className={`mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium transition hover:bg-[#111a2f] ${
                    item.path && isActivePath(item.path)
                      ? 'bg-[#151b2e] text-white'
                      : restricted
                        ? 'text-slate-500'
                        : 'text-white'
                  }`}
                >
                  <item.icon size={18} className="text-white/95" />
                  <span>{item.label}</span>
                  {item.label === 'Inbox' ? (
                    <span className="ml-auto rounded-full bg-[#3a2a21] px-1.5 text-[10px] font-semibold text-[#ffbf8b]">
                      4
                    </span>
                  ) : null}
                </button>
              )
              if (!item.path) {
                return (
                  <div key={item.label} className="mb-2 flex items-center gap-2 px-3 py-1.5 text-slate-500">
                    <item.icon size={18} />
                    <span className="text-sm">{item.label}</span>
                  </div>
                )
              }
              return (
                <RestrictedControl
                  key={item.label}
                  restricted={restricted}
                  reason={itemRestrictedReason(item)}
                  className="w-full"
                >
                  {btn}
                </RestrictedControl>
              )
            })}
          </nav>

          <div className="mt-auto px-2 pb-6">
            <button
              type="button"
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-[#2b3858] bg-[#1a2338] px-3 py-2 text-left text-base font-semibold text-white"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-sm">
                <Plus size={14} />
              </span>
              Get set up
            </button>

            {bottomItems.map((item) =>
              item.label === 'Profile' ? (
                <div key={item.label}>{renderExpandedProfileRow()}</div>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleBottomNav(item)}
                  className={`mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium transition hover:bg-[#111a2f] ${
                    item.path && isActivePath(item.path)
                      ? 'bg-[#151b2e] text-white'
                      : 'text-white'
                  }`}
                >
                  <item.icon size={18} className="text-white/95" />
                  <span>{item.label}</span>
                  {item.label === 'Search' ? (
                    <span className="ml-auto rounded-md border border-white/20 px-1.5 py-0.5 text-[10px] text-slate-300">
                      Ctrl K
                    </span>
                  ) : null}
                </button>
              ),
            )}
          </div>
      </div>
    </aside>
  )
}
