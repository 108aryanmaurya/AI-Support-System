import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { useOrgPermissionsContext } from '../context/OrgPermissionsContext.jsx'
import {
  filterSettingsNav,
  settingsChildPathActive,
  settingsSectionHasActiveChild,
  settingsNav,
} from './settings/settingsNav.js'

function SettingsNavChild({ orgId, child }) {
  const Icon = child.icon
  const baseClass =
    'flex min-w-0 items-center gap-2.5 rounded-lg py-2 pl-9 pr-3 text-left text-sm transition md:w-full'

  if (child.disabled || !child.path) {
    return (
      <span
        className={`${baseClass} cursor-not-allowed text-slate-600 opacity-60`}
        aria-disabled="true"
      >
        {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> : null}
        <span className="flex-1 truncate">{child.label}</span>
      </span>
    )
  }

  return (
    <NavLink
      to={`/org/${orgId}/settings/${child.path}`}
      className={({ isActive }) =>
        `${baseClass} ${
          isActive
            ? 'bg-[#151b2e] font-medium text-white'
            : 'text-slate-400 hover:bg-[#111827] hover:text-slate-200'
        }`
      }
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> : null}
      <span className="flex-1 truncate">{child.label}</span>
    </NavLink>
  )
}

function SettingsNavSection({ orgId, section, pathname, expanded, onToggle }) {
  const isActiveSection = settingsSectionHasActiveChild(orgId, pathname, section)
  const isOpen = expanded[section.id] !== undefined ? expanded[section.id] : isActiveSection

  return (
    <div className="md:w-full">
      <button
        type="button"
        onClick={() => onToggle(section.id)}
        className={`flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition md:w-full ${
          isActiveSection && !isOpen
            ? 'text-white'
            : 'text-slate-400 hover:bg-[#111827] hover:text-slate-200'
        }`}
        aria-expanded={isOpen}
      >
        <span className="flex-1 md:inline">{section.label}</span>
        {isOpen ? (
          <ChevronDown className="hidden h-4 w-4 shrink-0 text-slate-500 md:inline" aria-hidden />
        ) : (
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-500 md:inline" aria-hidden />
        )}
      </button>
      {isOpen ? (
        <div className="hidden flex-col md:flex">
          {section.children.map((child) => (
            <SettingsNavChild key={child.id} orgId={orgId} child={child} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function OrgSettingsLayout() {
  const { orgId } = useParams()
  const { pathname } = useLocation()
  const { can } = useOrgPermissionsContext()

  const visibleNav = useMemo(() => filterSettingsNav(settingsNav, can), [can])

  const [expanded, setExpanded] = useState({})

  const toggleSection = (sectionId) => {
    const section = visibleNav.find((s) => s.id === sectionId)
    const isActiveSection = section
      ? settingsSectionHasActiveChild(orgId, pathname, section)
      : false
    setExpanded((prev) => ({
      ...prev,
      [sectionId]: !(prev[sectionId] !== undefined ? prev[sectionId] : isActiveSection),
    }))
  }

  const isSettingsHome =
    pathname === `/org/${orgId}/settings` || pathname === `/org/${orgId}/settings/`

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[#0b1020] text-slate-100 md:flex-row">
      <aside className="shrink-0 border-b border-[#1d253a] bg-[#080c14] py-4 md:w-[220px] md:border-b-0 md:border-r md:py-6">
        <h2 className="px-4 text-lg font-bold tracking-tight text-white md:px-5">Settings</h2>
        <nav
          className="mt-3 flex gap-1 overflow-x-auto px-2 pb-1 md:mt-5 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0"
          aria-label="Settings sections"
        >
          {visibleNav.map((item) => {
            if (item.id === 'home') {
              return (
                <NavLink
                  key={item.id}
                  to={`/org/${orgId}/settings`}
                  end
                  className={() =>
                    `flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition md:w-full ${
                      isSettingsHome
                        ? 'bg-[#151b2e] text-white'
                        : 'text-slate-400 hover:bg-[#111827] hover:text-slate-200'
                    }`
                  }
                >
                  <span className="flex-1 md:inline">{item.label}</span>
                </NavLink>
              )
            }

            if (item.children?.length) {
              return (
                <div key={item.id} className="hidden md:block">
                  <SettingsNavSection
                    orgId={orgId}
                    section={item}
                    pathname={pathname}
                    expanded={expanded}
                    onToggle={toggleSection}
                  />
                </div>
              )
            }

            return null
          })}

          {/* Mobile: flat links for visible routable children */}
          <div className="flex gap-1 md:hidden">
            {visibleNav.flatMap((section) =>
              (section.children ?? [])
                .filter((child) => child.path && !child.disabled)
                .map((child) => (
                  <NavLink
                    key={`m-${child.id}`}
                    to={`/org/${orgId}/settings/${child.path}`}
                    className={({ isActive }) =>
                      `shrink-0 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
                        isActive || settingsChildPathActive(orgId, pathname, child.path)
                          ? 'bg-[#151b2e] text-white'
                          : 'text-slate-400'
                      }`
                    }
                  >
                    {child.label}
                  </NavLink>
                )),
            )}
          </div>
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
