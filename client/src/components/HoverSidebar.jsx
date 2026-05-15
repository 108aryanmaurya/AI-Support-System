import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  BookOpen,
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

const topItems = [
  { label: 'Inbox', icon: Home, path: 'inbox' },
  { label: 'Fin AI Agent', icon: Bot },
  { label: 'Knowledge', icon: BookOpen },
  { label: 'Reports', icon: SquareChartGantt, path: 'reports' },
  { label: 'Outbound', icon: ArrowRight },
  { label: 'Contacts', icon: ContactRound },
]

const bottomItems = [
  { label: 'Search', icon: Search, path: 'search' },
  { label: 'Settings', icon: Cog },
  { label: 'Profile', icon: CircleUserRound },
]

export function HoverSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { orgId } = useParams()

  function goToSettings() {
    if (orgId) navigate(`/org/${orgId}/settings`)
  }

  function goToWorkspacePath(segment) {
    if (orgId && segment) navigate(`/org/${orgId}/${segment}`)
  }

  function handleTopNav(item) {
    if (item.path) goToWorkspacePath(item.path)
  }

  function handleBottomNav(item) {
    if (item.label === 'Settings') goToSettings()
    else if (item.path) goToWorkspacePath(item.path)
  }

  function isActivePath(segment) {
    if (!segment || !orgId) return false
    return location.pathname.startsWith(`/org/${orgId}/${segment}`)
  }

  return (
    <aside
      className="fixed left-0 top-0 z-50 h-screen w-[72px]"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className="flex h-full w-[72px] flex-col items-center border-r border-[#1d253a] bg-black/95 py-4">
        <img src={minifiedLogo} alt="ResolveAI" className="w-20 object-contain" />
        <div className="mt-8 flex flex-1 flex-col items-center gap-5 text-white/95">
          {topItems.map((item) =>
            item.path ? (
              <button
                key={item.label}
                type="button"
                onClick={() => handleTopNav(item)}
                aria-label={item.label}
                className="text-white/95 transition hover:text-white"
              >
                <item.icon size={18} />
              </button>
            ) : (
              <item.icon key={item.label} size={18} />
            ),
          )}
        </div>
        <div className="mb-2 flex flex-col items-center gap-5 text-white/95">
          <button type="button">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-sm">
              <Plus size={14} />
            </span>
          </button>
          {bottomItems.map((item) =>
            item.label === 'Settings' ? (
              <button
                key={item.label}
                type="button"
                onClick={goToSettings}
                aria-label="Settings"
                className="text-white/95 transition hover:text-white"
              >
                <item.icon size={18} />
              </button>
            ) : (
              <item.icon key={item.label} size={18} />
            ),
          )}
        </div>
      </div>

      <div
        className={`  md:flex md:flex-col  absolute left-0 top-0 h-screen w-[220px] border-r border-[#1d253a] bg-black/98 px-3  shadow-2xl transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-2">
            <Logo variant="dark" />
          </div>

          <nav className="px-3 ">
            {topItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleTopNav(item)}
                className={`mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium transition hover:bg-[#111a2f] ${
                  item.path && isActivePath(item.path)
                    ? 'bg-[#151b2e] text-white'
                    : 'text-white'
                }`}
              >
                <item.icon size={18} className="text-white/95" />
                <span>{item.label}</span>
                {item.label === 'Inbox' ? (
                  <span className="ml-auto rounded-full bg-[#3a2a21] px-1.5 text-[10px] font-semibold text-[#ffbf8b]">4</span>
                ) : null}
              </button>
            ))}
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

            {bottomItems.map((item) => (
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
                  <span className="ml-auto rounded-md border border-white/20 px-1.5 py-0.5 text-[10px] text-slate-300">Ctrl K</span>
                ) : null}
                {item.label === 'Profile' ? <span className="ml-auto h-2 w-2 rounded-full bg-[#3ECF8E]" /> : null}
              </button>
            ))}
          </div>
      </div>
    </aside>
  )
}
