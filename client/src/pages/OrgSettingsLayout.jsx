import { ChevronRight } from 'lucide-react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { settingsNav } from './settings/settingsNav.js'

export default function OrgSettingsLayout() {
  const { orgId } = useParams()

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[#0b1020] text-slate-100 md:flex-row">
      <aside className="shrink-0 border-b border-[#1d253a] bg-[#080c14] py-4 md:w-[220px] md:border-b-0 md:border-r md:py-6">
        <h2 className="px-4 text-lg font-bold tracking-tight text-white md:px-5">Settings</h2>
        <nav
          className="mt-3 flex gap-1 overflow-x-auto px-2 pb-1 md:mt-5 md:flex-col md:gap-0.5 md:pb-0"
          aria-label="Settings sections"
        >
          {settingsNav.map((item) => {
            if (item.id === 'home') {
              return (
                <NavLink
                  key={item.id}
                  to={`/org/${orgId}/settings`}
                  end
                  className={({ isActive }) =>
                    `flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition md:w-full ${
                      isActive
                        ? 'bg-[#151b2e] text-white'
                        : 'text-slate-400 hover:bg-[#111827] hover:text-slate-200'
                    }`
                  }
                >
                  <span className="flex-1 md:inline">{item.label}</span>
                </NavLink>
              )
            }
            return (
              <button
                key={item.id}
                type="button"
                className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap text-slate-400 transition hover:bg-[#111827] hover:text-slate-200 md:w-full"
              >
                <span className="flex-1 md:inline">{item.label}</span>
                {item.chevron ? (
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-500 md:inline" aria-hidden />
                ) : null}
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
