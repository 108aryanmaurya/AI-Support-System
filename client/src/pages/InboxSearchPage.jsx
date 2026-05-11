import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { InboxSidebar } from '../components/InboxSidebar.jsx'
import { useInboxSidebarActions } from '../hooks/useInboxSidebarActions.js'

export default function InboxSearchPage() {
  const { orgId: orgFromRoute } = useParams()
  const organizationId =
    (typeof orgFromRoute === 'string' && orgFromRoute.trim()) ||
    import.meta.env.VITE_TEST_ORGANIZATION_ID?.trim() ||
    ''

  const setLoadingNoop = useCallback(() => {}, [])
  const setErrorNoop = useCallback(() => {}, [])

  const {
    onSelectSidebarFilter,
    mentionCue,
    activeFilter,
    filterCounts,
    autoAssignOnSelect,
    setAutoAssignOnSelect,
  } = useInboxSidebarActions(organizationId, {
    setLoadingConversations: setLoadingNoop,
    setError: setErrorNoop,
    silentFilterRefetch: true,
  })

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0f1422] text-slate-100">
      <div className="grid h-full min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] gap-0 overflow-hidden">
        <InboxSidebar
          activeFilter={activeFilter}
          filterCounts={filterCounts}
          onSelectSidebarFilter={onSelectSidebarFilter}
          mentionCue={mentionCue}
          autoAssignOnSelect={autoAssignOnSelect}
          setAutoAssignOnSelect={setAutoAssignOnSelect}
        />
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#101729]">
          <div className="shrink-0 border-b border-[#27314a] px-6 py-5">
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
              <Search size={24} className="text-slate-300" aria-hidden />
              Search
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {organizationId
                ? 'Search conversations in this workspace. (UI coming soon.)'
                : 'Set VITE_TEST_ORGANIZATION_ID or open this page from an organization URL.'}
            </p>
          </div>
          <div className="inbox-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [scrollbar-gutter:stable]">
            <div className="mx-auto max-w-2xl">
              <input
                type="search"
                placeholder="Search conversations…"
                className="w-full rounded-lg border border-[#334060] bg-[#0e1526] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#4f6290]"
                autoFocus
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
