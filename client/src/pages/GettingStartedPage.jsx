import { Logo } from '../components/Logo.jsx'
import {
  ArrowRight,
  Bot,
  BookOpen,
  CircleUserRound,
  Cog,
  ContactRound,
  Home,
  Plus,
  Search,
  SquareChartGantt,
} from 'lucide-react'

const setupItems = [
  {
    title: 'Set up channels to connect with your customers',
    body: 'Manage conversations across all channels: Messenger, email, phone, WhatsApp, and social.',
    action: 'Set up channels',
  },
  {
    title: 'Invite your teammates to collaborate faster',
    body: 'Bring your team into the workspace and assign ownership by organization member roles.',
  },
  {
    title: 'Add content to power your AI and Help Center',
    body: 'Seed your assistant with FAQs, policy docs, and internal support playbooks.',
  },
]

const nextCards = [
  {
    title: 'Speak to a specialist',
    body: 'Get expert guidance as you get up and running with ResolveAI.',
  },
  {
    title: 'Get the best from AI and Automation',
    body: 'Learn to use workflows and copilots to empower your support team.',
  },
  {
    title: 'Improve your customer experience',
    body: 'Track key metrics and optimize response quality with confidence.',
  },
]

export default function GettingStartedPage() {
  const topItems = [
    { label: 'Inbox', icon: Home },
    { label: 'Fin AI Agent', icon: Bot },
    { label: 'Knowledge', icon: BookOpen },
    { label: 'Reports', icon: SquareChartGantt },
    { label: 'Outbound', icon: ArrowRight },
    { label: 'Contacts', icon: ContactRound },
  ]
  const bottomItems = [
    { label: 'Search', icon: Search },
    { label: 'Settings', icon: Cog },
    { label: 'Profile', icon: CircleUserRound },
  ]

  return (
    <main className="min-h-screen w-full bg-[#0b1020] text-slate-100">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-[210px] border-r border-[#1d253a] bg-black md:flex md:flex-col">
          <div className="px-2">
            <Logo variant="dark" />
          </div>

          <nav className="px-3 ">
            {topItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium text-white transition hover:bg-[#111a2f]"
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
                className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium text-white transition hover:bg-[#111a2f]"
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
        </aside>

        <section className="flex-1 bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.08),transparent_35%)] px-4 py-5 sm:px-6 md:px-10">
          <div className="rounded-xl border border-[#3ECF8E]/25 bg-[#1a1f35] px-4 py-2 text-center text-sm text-slate-200">
            You have 12 days left in your Advanced trial. Includes unlimited AI usage.
          </div>

          <div className="mx-auto mt-6 w-full max-w-5xl">
            <h1 className="text-4xl font-semibold tracking-tight text-white">Get started with AI-first customer support</h1>
            <p className="mt-4 text-sm font-medium text-slate-300">Get set up · 0 / 3 steps</p>

            <div className="mt-4 rounded-2xl border border-[#263455] bg-[#11182b] p-4 shadow-2xl">
              <div className="grid gap-4 md:grid-cols-[1fr_210px]">
                <div className="space-y-3">
                  {setupItems.map((item, index) => (
                    <article key={item.title} className="rounded-xl border border-[#2a3758] bg-[#0f172a] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-white">
                            {index + 1}. {item.title}
                          </h3>
                          <p className="mt-1 text-sm text-slate-300">{item.body}</p>
                        </div>
                        {item.action ? (
                          <button
                            type="button"
                            className="rounded-full border border-[#3ECF8E]/50 bg-[#3ECF8E]/15 px-4 py-1.5 text-xs font-semibold text-[#b7f5d6] transition hover:bg-[#3ECF8E]/20"
                          >
                            {item.action}
                          </button>
                        ) : (
                          <span className="text-slate-500">›</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden rounded-xl border border-[#2a3758] bg-[#0e1528] p-3 md:block">
                  <div className="h-full rounded-lg bg-gradient-to-b from-[#dbeafe] to-[#bfdbfe] p-2">
                    <div className="rounded-lg bg-white/95 p-2 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700">Views</p>
                      <ul className="mt-2 space-y-1">
                        <li>All channels</li>
                        <li>Messenger</li>
                        <li>WhatsApp & Social</li>
                        <li>Phone & SMS</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <h2 className="mt-8 text-xl font-semibold text-white">Go further</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {nextCards.map((card, idx) => (
                <article key={card.title} className="rounded-2xl border border-[#2a3758] bg-[#111827] p-5">
                  <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#3ECF8E]/20 text-[#8af1bf]">
                    {idx + 1}
                  </div>
                  <h3 className="text-sm font-semibold text-white">{card.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
