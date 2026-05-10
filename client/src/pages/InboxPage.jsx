import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CircleUserRound,
  Clock3,
  Ellipsis,
  
  Flame,
  Folder,
  Handshake,
  HelpCircle,
  Inbox,
  
  Link2,
  ListFilter,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneCall,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  Star,
  Users,
  UserRoundPlus,
  X,
} from 'lucide-react'
import { apiFetch } from '../services/api.js'
import {
  createSendMessage,
  getMessageDeliveryStatus,
  validateOutboundMessage,
} from '../services/conversationSendMessage.js'
import { useAuth } from '../hooks/useAuth.js'
import { useInboxPeriodicSync } from '../hooks/useInboxPeriodicSync.js'
import { useRealtimeInbox } from '../hooks/useRealtimeInbox.js'
import { formatTypingIndicator, useTypingPresence } from '../hooks/useTypingPresence.js'
import { CONVERSATION_FILTER_CACHE_MS, FILTER_REFETCH_DEBOUNCE_MS, INBOX_SIDEBAR_FILTERS } from '../config/inboxFilters.js'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback.js'
import {
  conversationCountsUrl,
  conversationMembersUrl,
  conversationMessagesUrl,
  conversationsListUrl,
  patchConversationSpamUrl,
  patchConversationUrl,
} from '../services/inboxApi.js'
import { DEFAULT_INBOX_FILTER, useInboxStore } from '../stores/inboxStore.js'

const finForServiceOptions = [
  { label: 'All conversations', icon: ListFilter },
  { label: 'Resolved', icon: Folder },
  { label: 'Needs teammate input', icon: UserRoundPlus },
  { label: 'Escalated & Handoff', icon: Handshake },
  { label: 'Pending', icon: HelpCircle },
  { label: 'Spam', icon: ShieldAlert },
]

const MESSAGE_LIST_SCROLL_BOTTOM_PX = 80

const viewOptions = [
  { label: 'Messenger', count: 1 },
  { label: 'Email', count: 1 },
  { label: 'WhatsApp & Social', count: 1 },
  { label: 'Phone & SMS', count: 1 },
  { label: 'Tickets', count: 0 },
]

function getRelativeTimeLabel(isoDate) {
  if (!isoDate) return '-'
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  if (!Number.isFinite(then)) return '-'
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  return `${Math.floor(diffHr / 24)}d`
}

function MessageContentRich({ text }) {
  if (typeof text !== 'string') return text
  const parts = text.split(/(@[\w.-]+)/g)
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={`m-${i}`} className="font-semibold text-sky-300">
        {part}
      </span>
    ) : (
      <span key={`t-${i}`}>{part}</span>
    ),
  )
}

function toConversationViewModel(item) {
  const channel = (item.source ?? 'chat').slice(0, 1).toUpperCase() || 'C'
  return {
    ...item,
    title: `${item.source ?? 'chat'} - ${item.id.slice(0, 8)}`,
    body: item.last_message_preview ?? 'No messages yet',
    time: getRelativeTimeLabel(item.last_message_at),
    channel,
  }
}

const ConversationListRow = memo(
  function ConversationListRow({ conversationId, title, body, timeLabel, channelLetter, isActive, onSelect }) {
    return (
      <article
        role="button"
        tabIndex={0}
        onClick={() => onSelect(conversationId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(conversationId)
          }
        }}
        className={`border-b border-[#27314a] px-1 py-3 last:border-b-0 ${
          isActive ? 'rounded-xl border border-[#384b70] bg-[#1a2337]' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">
            {channelLetter}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-[#d8deef]">{title}</p>
              {title.startsWith('Email') ? <Star size={14} className="fill-yellow-400 text-yellow-400" /> : null}
            </div>
            <p className="mt-1 truncate text-sm text-slate-300">{body}</p>
          </div>
          <span className="text-xs text-slate-300">{timeLabel}</span>
        </div>
      </article>
    )
  },
  (prev, next) =>
    prev.conversationId === next.conversationId &&
    prev.title === next.title &&
    prev.body === next.body &&
    prev.timeLabel === next.timeLabel &&
    prev.channelLetter === next.channelLetter &&
    prev.isActive === next.isActive &&
    prev.onSelect === next.onSelect,
)

export default function InboxPage() {
  const { orgId: orgFromRoute } = useParams()
  const organizationId =
    (typeof orgFromRoute === 'string' && orgFromRoute.trim()) ||
    import.meta.env.VITE_TEST_ORGANIZATION_ID?.trim() ||
    ''
  const { user } = useAuth()
  const conversations = useInboxStore((state) => state.conversations)
  const activeConversationId = useInboxStore((state) => state.activeConversationId)
  const activeFilter = useInboxStore((state) => state.activeFilter)
  const filterCounts = useInboxStore((state) => state.filterCounts)
  const conversationPagination = useInboxStore((state) => state.conversationPagination)
  const messagesByConversationId = useInboxStore((state) => state.messagesByConversationId)
  const activeViewersByConversationId = useInboxStore((state) => state.activeViewersByConversationId)
  const typingState = useInboxStore((state) => state.typingState)
  const setConversationsPage = useInboxStore((state) => state.setConversationsPage)
  const setActiveConversationId = useInboxStore((state) => state.setActiveConversationId)
  const setMessagesForConversation = useInboxStore((state) => state.setMessagesForConversation)
  const setActiveFilter = useInboxStore((state) => state.setActiveFilter)
  const setFilterCounts = useInboxStore((state) => state.setFilterCounts)
  const cacheConversationFilterPage = useInboxStore((state) => state.cacheConversationFilterPage)
  const invalidateConversationFilterCache = useInboxStore((state) => state.invalidateConversationFilterCache)
  const upsertConversation = useInboxStore((state) => state.upsertConversation)
  const autoAssignOnSelect = useInboxStore((state) => state.autoAssignOnSelect)
  const setAutoAssignOnSelect = useInboxStore((state) => state.setAutoAssignOnSelect)

  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [draftMessage, setDraftMessage] = useState('')
  const [error, setError] = useState('')
  const [orgMembers, setOrgMembers] = useState([])
  const [assigningConversation, setAssigningConversation] = useState(false)
  const [spamUpdating, setSpamUpdating] = useState(false)

  const messagesScrollRef = useRef(null)
  const stickToBottomRef = useRef(true)

  const runConversationQuery = useCallback(
    async (filterType, opts = {}) => {
      const silent = opts.silent === true
      if (!organizationId) return
      if (!silent) setLoadingConversations(true)
      if (!silent) setError('')
      try {
        const response = await apiFetch(conversationsListUrl(organizationId, filterType))
        setConversationsPage({
          items: response?.items ?? [],
          pagination: response?.pagination,
        })
        cacheConversationFilterPage(filterType, {
          items: response?.items ?? [],
          pagination: response?.pagination,
        })
      } catch (err) {
        if (!silent) setError(err?.message || 'Failed to load conversations.')
      } finally {
        if (!silent) setLoadingConversations(false)
      }
    },
    [organizationId, setConversationsPage, cacheConversationFilterPage],
  )

  const loadFilterCounts = useCallback(async () => {
    if (!organizationId) return
    try {
      const counts = await apiFetch(conversationCountsUrl(organizationId))
      setFilterCounts(counts)
    } catch {
      /* counts are best-effort */
    }
  }, [organizationId, setFilterCounts])

  useEffect(() => {
    if (!organizationId) {
      const t = window.setTimeout(() => setOrgMembers([]), 0)
      return () => clearTimeout(t)
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch(conversationMembersUrl(organizationId))
        if (!cancelled) setOrgMembers(res?.members ?? [])
      } catch {
        if (!cancelled) setOrgMembers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  const myMembership = useMemo(
    () => orgMembers.find((m) => m.userId === user?.id) ?? null,
    [orgMembers, user?.id],
  )

  const setInboxSortMemberId = useInboxStore((state) => state.setInboxSortMemberId)
  useEffect(() => {
    setInboxSortMemberId(myMembership?.id ?? null)
  }, [myMembership?.id, setInboxSortMemberId])

  const membersByMemberId = useMemo(() => {
    const map = new Map()
    for (const row of orgMembers) map.set(row.id, row)
    return map
  }, [orgMembers])

  const mentionMembersForParse = useMemo(
    () =>
      orgMembers.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        email: m.email,
      })),
    [orgMembers],
  )

  const sendMessage = useMemo(
    () =>
      createSendMessage({
        organizationId,
        senderUserId: user?.id ?? null,
        apiFetch,
        mentionMembers: mentionMembersForParse,
      }),
    [organizationId, user?.id, mentionMembersForParse],
  )

  const mentionsNotifyEpoch = useInboxStore((state) => state.mentionsNotifyEpoch)
  const [mentionCue, setMentionCue] = useState(false)

  useEffect(() => {
    if (mentionsNotifyEpoch === 0) return undefined
    const tOn = window.setTimeout(() => setMentionCue(true), 0)
    const tOff = window.setTimeout(() => setMentionCue(false), 1600)
    return () => {
      clearTimeout(tOn)
      clearTimeout(tOff)
    }
  }, [mentionsNotifyEpoch])

  const debouncedRefetchFilter = useDebouncedCallback((filterType) => {
    void (async () => {
      await runConversationQuery(filterType, { silent: false })
      await loadFilterCounts()
    })()
  }, FILTER_REFETCH_DEBOUNCE_MS)

  const onSelectSidebarFilter = useCallback(
    (filterType) => {
      setActiveFilter(filterType)
      const cached = useInboxStore.getState().conversationFilterCache[filterType]
      const fresh = cached && Date.now() - cached.fetchedAt < CONVERSATION_FILTER_CACHE_MS
      if (fresh) {
        setConversationsPage({
          items: cached.items,
          pagination: cached.pagination,
        })
      }
      debouncedRefetchFilter(filterType)
    },
    [setActiveFilter, setConversationsPage, debouncedRefetchFilter],
  )

  const loadMessages = useCallback(
    async (conversationId, opts = {}) => {
      const silent = opts.silent === true
      if (!organizationId || !conversationId) return
      if (!silent) setLoadingMessages(true)
      if (!silent) setError('')
      try {
        const response = await apiFetch(
          conversationMessagesUrl(organizationId, conversationId, { page: 1, pageSize: 100 }),
        )
        setMessagesForConversation(conversationId, response?.items ?? [])
      } catch (err) {
        if (!silent) setError(err?.message || 'Failed to load messages.')
      } finally {
        if (!silent) setLoadingMessages(false)
      }
    },
    [organizationId, setMessagesForConversation],
  )

  const handleRealtimeReconnect = useCallback(async () => {
    const filter = useInboxStore.getState().activeFilter
    await runConversationQuery(filter, { silent: true })
    await loadFilterCounts()
    const convId = useInboxStore.getState().activeConversationId
    if (convId) {
      await loadMessages(convId, { silent: true })
    }
  }, [runConversationQuery, loadFilterCounts, loadMessages])

  useRealtimeInbox({
    organizationId,
    userId: user?.id ?? '',
    onReconnect: handleRealtimeReconnect,
  })

  useInboxPeriodicSync({
    organizationId,
    activeConversationId,
    enabled: Boolean(organizationId && user?.id),
  })

  const agentDisplayName =
    (typeof user?.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    (typeof user?.email === 'string' ? user.email.split('@')[0] : '') ||
    'Agent'

  const { onComposerActivity, stopTypingImmediately } = useTypingPresence({
    conversationId: activeConversationId,
    userId: user?.id ?? '',
    displayName: agentDisplayName,
    enabled: Boolean(organizationId && user?.id && activeConversationId),
  })

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )
  const messages = useMemo(
    () => messagesByConversationId[activeConversationId] ?? [],
    [activeConversationId, messagesByConversationId],
  )

  const assigneeLabel = useMemo(() => {
    const mid = selectedConversation?.assigned_to_member_id
    if (!mid) return 'Unassigned'
    if (myMembership?.id === mid) return 'You'
    return membersByMemberId.get(mid)?.displayName ?? `${mid.slice(0, 8)}…`
  }, [selectedConversation?.assigned_to_member_id, myMembership?.id, membersByMemberId])

  const updateStickToBottom = useCallback(() => {
    const el = messagesScrollRef.current
    if (!el) return
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= MESSAGE_LIST_SCROLL_BOTTOM_PX
  }, [])

  useEffect(() => {
    stickToBottomRef.current = true
  }, [activeConversationId])

  useLayoutEffect(() => {
    const el = messagesScrollRef.current
    if (!el || !stickToBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [messages, activeConversationId])
  const activeViewers = activeViewersByConversationId[activeConversationId] ?? []
  const typingUsers = typingState[activeConversationId] ?? []
  const typingLabel = formatTypingIndicator(typingUsers)

  const listTotal = conversationPagination.total ?? conversations.length

  useEffect(() => {
    if (!organizationId) return undefined
    invalidateConversationFilterCache()
    useInboxStore.setState({ activeFilter: DEFAULT_INBOX_FILTER })
    let cancelled = false
    ;(async () => {
      setLoadingConversations(true)
      setError('')
      try {
        const filter = DEFAULT_INBOX_FILTER
        const response = await apiFetch(conversationsListUrl(organizationId, filter))
        if (cancelled) return
        setConversationsPage({
          items: response?.items ?? [],
          pagination: response?.pagination,
        })
        cacheConversationFilterPage(filter, {
          items: response?.items ?? [],
          pagination: response?.pagination,
        })
        const counts = await apiFetch(conversationCountsUrl(organizationId))
        if (!cancelled) setFilterCounts(counts)
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load conversations.')
      } finally {
        if (!cancelled) setLoadingConversations(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, invalidateConversationFilterCache, setConversationsPage, cacheConversationFilterPage, setFilterCounts])

  useEffect(() => {
    if (!activeConversationId) return undefined
    const t = window.setTimeout(() => {
      void loadMessages(activeConversationId)
    }, 0)
    return () => clearTimeout(t)
  }, [activeConversationId, loadMessages])

  const conversationView = useMemo(() => conversations.map(toConversationViewModel), [conversations])

  const assignConversation = useCallback(
    async (conversationId, memberId) => {
      if (!organizationId || !conversationId) return
      setAssigningConversation(true)
      setError('')
      try {
        const res = await apiFetch(patchConversationUrl(organizationId, conversationId), {
          method: 'PATCH',
          body: JSON.stringify({
            assignedToMemberId: memberId,
          }),
        })
        const updated = res?.conversation
        if (updated) upsertConversation(updated)
        const filterNow = useInboxStore.getState().activeFilter
        await runConversationQuery(filterNow, { silent: true })
        await loadFilterCounts()
      } catch (err) {
        setError(err?.message || 'Could not update assignment.')
      } finally {
        setAssigningConversation(false)
      }
    },
    [organizationId, upsertConversation, runConversationQuery, loadFilterCounts],
  )

  const handleSelectConversation = useCallback(
    (id) => {
      setActiveConversationId(id)
      const conv = useInboxStore.getState().conversations.find((c) => c.id === id)
      const myMid = myMembership?.id
      if (
        useInboxStore.getState().autoAssignOnSelect &&
        organizationId &&
        myMid &&
        conv &&
        conv.assigned_to_member_id !== myMid
      ) {
        void assignConversation(id, myMid)
      }
    },
    [setActiveConversationId, organizationId, myMembership?.id, assignConversation],
  )

  const applySpamFlag = useCallback(
    async (conversationId, isSpam) => {
      if (!organizationId || !conversationId) return
      setSpamUpdating(true)
      setError('')
      try {
        const res = await apiFetch(patchConversationSpamUrl(organizationId, conversationId), {
          method: 'PATCH',
          body: JSON.stringify({ is_spam: isSpam }),
        })
        const updated = res?.conversation
        if (updated) upsertConversation(updated)
        const filterNow = useInboxStore.getState().activeFilter
        await runConversationQuery(filterNow, { silent: true })
        await loadFilterCounts()
      } catch (err) {
        setError(err?.message || 'Could not update spam flag.')
      } finally {
        setSpamUpdating(false)
      }
    },
    [organizationId, upsertConversation, runConversationQuery, loadFilterCounts],
  )

  const trimmedDraft = draftMessage.trim()
  const canSendMessage = Boolean(activeConversationId && organizationId && trimmedDraft) && !sendingMessage

  const handleSendMessage = useCallback(async () => {
    if (!activeConversationId || !organizationId) return

    const validated = validateOutboundMessage(draftMessage)
    if (!validated.ok) {
      setError(validated.error)
      return
    }

    stopTypingImmediately()

    const body = validated.content

    setSendingMessage(true)
    setError('')
    setDraftMessage('')

    try {
      const result = await sendMessage(activeConversationId, body)

      if (!result.ok && !result.skipped) {
        setError(result.error || 'Failed to send message.')
        setDraftMessage(body)
      }
    } finally {
      setSendingMessage(false)
    }
  }, [activeConversationId, draftMessage, organizationId, sendMessage, stopTypingImmediately])

  const handleRetryMessage = useCallback(
    async (message) => {
      if (!activeConversationId || !organizationId || !message?.content) return
      setError('')
      setSendingMessage(true)
      try {
        const result = await sendMessage(activeConversationId, message.content, {
          retryOfMessageId: message.id,
        })
        if (!result.ok && !result.skipped) {
          setError(result.error || 'Retry failed.')
        }
      } finally {
        setSendingMessage(false)
      }
    },
    [activeConversationId, organizationId, sendMessage],
  )

  const onComposerKeyDown = useCallback(
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!canSendMessage) return
        handleSendMessage()
      }
    },
    [canSendMessage, handleSendMessage],
  )

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0f1422] text-slate-100">
      <div className="grid h-full min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.1fr)] gap-0 overflow-hidden">
        <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[#27314a] bg-[#121a2b]">
          <div className="inbox-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Inbox</h2>
            <button className="rounded-md bg-[#1b2741] p-1.5">
              <Sparkles size={14} />
            </button>
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-[#0e1526] px-2 py-2 text-sm text-slate-300">
            <Search size={14} /> Search
          </div>
          <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-lg border border-[#27314a] bg-[#0e1526] px-2 py-2 text-xs text-slate-400">
            <input
              type="checkbox"
              className="rounded border-[#4f6290] bg-[#0f1728]"
              checked={autoAssignOnSelect}
              onChange={(e) => setAutoAssignOnSelect(e.target.checked)}
            />
            <span>Auto-assign when opening</span>
          </label>
          <div className="space-y-1 text-sm">
            {INBOX_SIDEBAR_FILTERS.map((item) => {
              const isActive = activeFilter === item.id
              const count = filterCounts[item.id] ?? 0
              const mentionFlash = item.id === 'mentions' && mentionCue
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSidebarFilter(item.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors ${
                    isActive ? 'bg-[#1a2440] text-white' : 'text-slate-300 hover:bg-[#151e33]'
                  } ${mentionFlash ? 'ring-2 ring-sky-400/80 shadow-[0_0_14px_rgba(56,189,248,0.35)]' : ''}`}
                >
                  <span>{item.label}</span>
                  <span className="tabular-nums text-xs text-slate-400">{count}</span>
                </button>
              )
            })}
            <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-slate-400">
              <span>Dashboard</span>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-[#27314a] bg-[#0f1728] p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-white">Fin for Service</p>
              <div className="flex items-center gap-1 text-slate-400">
                <button type="button" className="rounded-md p-1 hover:bg-[#1a2440]">
                  <Plus size={12} />
                </button>
                <ChevronDown size={12} />
              </div>
            </div>
            <div className="space-y-0.5">
              {finForServiceOptions.map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-300">
                  <item.icon size={13} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between px-1 text-xs text-slate-400">
            <span>Team inboxes</span>
            <span className="inline-flex items-center gap-1">
              <Plus size={12} />
              <ChevronRight size={12} />
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-xs text-slate-400">
            <span>Teammates</span>
            <span className="inline-flex items-center gap-1">
              <Plus size={12} />
              <ChevronRight size={12} />
            </span>
          </div>

          <div className="mt-5 border-t border-[#27314a] pt-3 text-xs text-slate-400">Views</div>
          <div className="mt-2 space-y-1 text-sm">
            {viewOptions.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-md px-2 py-1.5 text-slate-300">
                <span className="inline-flex items-center gap-2">
                  <Flame size={13} className="text-slate-400" />
                  {item.label}
                </span>
                <span className="text-xs text-slate-400">{item.count}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-lg border border-[#334060] bg-[#1b2741] p-2 text-sm">
            <p className="font-semibold text-white">Get set up</p>
            <p className="mt-1 text-xs text-slate-300">Set up channels to connect with your customers</p>
          </div>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-[#27314a] bg-[#101729]">
          <div className="shrink-0 border-b border-[#27314a] px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-2xl font-semibold text-white">
                <CircleDot size={20} />
                Aryan Maurya
              </h3>
              <button className="rounded-full bg-[#1a2338] p-2 text-slate-200">
                <Search size={20} />
              </button>
            </div>
          </div>

          <div className="inbox-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [scrollbar-gutter:stable]">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full border border-[#3a4b6f] bg-[#18233b] px-2.5 py-1 text-[12px] font-semibold text-white">
                {loadingConversations ? 'Loading...' : `${listTotal} in view`}
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[#3a4b6f] bg-[#18233b] px-2.5 py-1 text-[12px] font-semibold text-white">
                  Last activity
                </span>
                <button className="rounded-full bg-[#1a2338] p-1.5 text-slate-300">
                  <SlidersHorizontal size={12} />
                </button>
              </div>
            </div>

            <div className="space-y-0">
              {conversationView.map((item) => (
                <ConversationListRow
                  key={item.id}
                  conversationId={item.id}
                  title={item.title}
                  body={item.body}
                  timeLabel={item.time}
                  channelLetter={item.channel}
                  isActive={item.id === activeConversationId}
                  onSelect={handleSelectConversation}
                />
              ))}
              {!loadingConversations && conversationView.length === 0 ? (
                <div className="px-1 py-3 text-sm text-slate-400">
                  {organizationId ? 'No conversations found.' : 'Set VITE_TEST_ORGANIZATION_ID to load conversations.'}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-[#27314a] bg-[#181f32]">
          <div className="flex shrink-0 items-center justify-between border-b border-[#27314a] px-3 py-4">
            <h3 className="text-2xl font-semibold">{selectedConversation ? selectedConversation.source ?? 'Messenger' : 'Messenger'}</h3>
            <div className="flex items-center gap-2 text-slate-300">
              <Star size={14} />
              <button className="rounded-full bg-[#2b3346] p-1.5">
                <Ellipsis size={14} />
              </button>
              <button className="rounded-full bg-[#2b3346] p-1.5">
                <MessageSquare size={14} />
              </button>
              <button className="rounded-full bg-[#2b3346] p-1.5">
                <Clock3 size={14} />
              </button>
              <button className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-900">Close</button>
            </div>
          </div>
          {selectedConversation ? (
            <div className="shrink-0 border-b border-[#27314a] px-3 py-2 text-xs text-slate-300">
              Active viewers: {activeViewers.length}
            </div>
          ) : null}

          <div
            ref={messagesScrollRef}
            className="inbox-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-3 [scrollbar-gutter:stable]"
            onScroll={updateStickToBottom}
          >
            <div className="rounded-xl border border-[#2a3654] bg-[#242c3f] p-4">
              <div className="mb-3 rounded-lg border border-[#334060] bg-[#2a3040] p-4 text-center">
                <div className="mb-3 flex justify-center gap-2 text-slate-200">
                  <PhoneCall size={14} />
                  <X size={14} />
                  <MessageCircle size={14} />
                  <X size={14} />
                  <Mail size={14} />
                </div>
                <div className="flex items-center justify-center gap-4">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-900">
                    <MessageSquare size={22} />
                  </div>
                  <span className="h-0.5 w-16 bg-slate-500" />
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-900">
                    <Inbox size={22} />
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-100">
                {selectedConversation
                  ? `Conversation ${selectedConversation.id.slice(0, 8)} is live. Incoming customer messages appear below in real-time.`
                  : 'Select a conversation from the list to view live messages.'}
              </p>
              {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            </div>

            {typingLabel ? (
              <p className="mt-4 text-sm italic text-slate-400" aria-live="polite">
                {typingLabel}
              </p>
            ) : null}
            {loadingMessages ? <p className="mt-4 text-sm text-slate-300">Loading messages...</p> : null}
            {!loadingMessages && messages.length === 0 ? (
              <p className="mt-4 text-sm text-slate-300">No messages yet.</p>
            ) : null}

            {messages.map((message) => {
              const delivery = getMessageDeliveryStatus(message)
              const isAgent = (message.sender_type ?? '') === 'agent'
              const statusLabel =
                delivery === 'sending' ? 'Sending' : delivery === 'failed' ? 'Failed' : 'Sent'
              return (
                <div key={message.id} className="mt-4 flex items-end justify-between gap-2">
                  <div className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4169b2] text-xs font-bold">
                    {(message.sender_type ?? 'c').slice(0, 1).toUpperCase()}
                  </div>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                      delivery === 'failed'
                        ? 'border border-red-400/70 bg-[#402a38]'
                        : delivery === 'sending'
                          ? 'border border-amber-400/40 bg-[#2f3a5c]'
                          : 'bg-[#334680]'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">
                      <MessageContentRich text={message.content} />
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-slate-300">
                        {message.sender_type} • {getRelativeTimeLabel(message.created_at)}
                      </p>
                      {isAgent ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            delivery === 'sending'
                              ? 'bg-amber-500/25 text-amber-200'
                              : delivery === 'failed'
                                ? 'bg-red-500/25 text-red-200'
                                : 'bg-emerald-500/20 text-emerald-200'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      ) : null}
                      {isAgent && delivery === 'failed' ? (
                        <button
                          type="button"
                          onClick={() => handleRetryMessage(message)}
                          disabled={sendingMessage || !activeConversationId}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300/40 bg-red-950/40 px-2 py-0.5 text-[11px] font-medium text-red-100 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <RotateCcw size={12} aria-hidden />
                          Retry
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mx-3 mb-3 mt-auto shrink-0 rounded-xl border border-[#2b3652] bg-[#1a2338] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MessageSquare size={14} /> Reply <ChevronDown size={14} />
            </div>
            <textarea
              value={draftMessage}
              onChange={(event) => {
                const next = event.target.value
                setDraftMessage(next)
                if (next.trim()) {
                  onComposerActivity()
                } else {
                  stopTypingImmediately()
                }
              }}
              onKeyDown={onComposerKeyDown}
              onBlur={() => stopTypingImmediately()}
              rows={3}
              placeholder={activeConversationId ? 'Type a reply...' : 'Select a conversation first'}
              className="mb-3 w-full resize-none rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#4f6290]"
              disabled={!activeConversationId || sendingMessage}
            />
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Use Ctrl/Cmd + Enter to send</span>
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!canSendMessage}
                className="rounded-md bg-[#334680] px-3 py-1 text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingMessage ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#141b2d] text-sm">
          <div className="flex shrink-0 gap-4 border-b border-[#27314a] p-4">
            <button className="text-lg text-white">Details</button>
            <button className="text-lg text-slate-400">Copilot</button>
          </div>
          <div className="inbox-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 text-slate-300 [scrollbar-gutter:stable]">
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0">Assignee</span>
                <span className="max-w-[160px] truncate text-right text-white" title={assigneeLabel}>
                  {assigneeLabel}
                </span>
              </div>
              <button
                type="button"
                disabled={
                  !selectedConversation ||
                  !myMembership ||
                  assigningConversation ||
                  myMembership.id === selectedConversation?.assigned_to_member_id
                }
                onClick={() =>
                  selectedConversation &&
                  myMembership &&
                  assignConversation(selectedConversation.id, myMembership.id)
                }
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#334060] bg-[#18233b] px-3 py-2 text-xs font-medium text-white hover:bg-[#1f2d4d] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <UserRoundPlus size={14} aria-hidden />
                {myMembership?.id === selectedConversation?.assigned_to_member_id
                  ? 'Assigned to you'
                  : 'Assign to me'}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span>Team inbox</span>
              <span className="text-white">{selectedConversation?.status ?? '—'}</span>
            </div>
            <div className="flex flex-col gap-2 border-t border-[#27314a] pt-3">
              <span className="text-xs text-slate-400">Spam</span>
              {selectedConversation?.is_spam === true ? (
                <button
                  type="button"
                  disabled={!selectedConversation || spamUpdating}
                  onClick={() =>
                    selectedConversation && applySpamFlag(selectedConversation.id, false)
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-950/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ShieldAlert size={14} aria-hidden />
                  Remove from spam
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!selectedConversation || spamUpdating}
                  onClick={() =>
                    selectedConversation && applySpamFlag(selectedConversation.id, true)
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ShieldAlert size={14} aria-hidden />
                  Mark as spam
                </button>
              )}
            </div>
            <div className="pt-2 text-xs text-slate-400">Links</div>
            <div className="flex items-center gap-2"><Link2 size={14} /> Tracker ticket</div>
            <div className="flex items-center gap-2"><ShieldAlert size={14} /> Back-office tickets</div>
            <div className="pt-2 text-xs text-slate-400">Conversation attributes</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span>Source</span><span className="text-white">{selectedConversation?.source ?? '-'}</span>
              <span>Priority</span><span className="text-white">{selectedConversation?.priority ?? '-'}</span>
              <span>ID</span><span className="text-white">{selectedConversation ? `${selectedConversation.id.slice(0, 8)}...` : '-'}</span>
            </div>
            <div className="pt-2 text-xs text-slate-400">User data</div>
            <div className="flex items-center gap-2"><CircleUserRound size={14} /> Customer: {selectedConversation?.customer_id ? `${selectedConversation.customer_id.slice(0, 8)}...` : 'N/A'}</div>
            <div className="flex items-center gap-2"><Users size={14} /> Team insights</div>
            <div className="flex items-center gap-2"><Bell size={14} /> Alerts</div>
            <div className="flex items-center gap-2"><Clock3 size={14} /> Last updated {getRelativeTimeLabel(selectedConversation?.last_message_at)}</div>
            <div className="flex items-center gap-2"><Phone size={14} /> Voice available</div>
          </div>
        </aside>
      </div>
    </main>
  )
}
