import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CircleUserRound,
  Clock3,
  Ellipsis,
  
  FileText,
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
  Sparkles,
  Star,
  Users,
  UserRoundPlus,
  X,
} from 'lucide-react'
import { apiFetch } from '../services/api.js'
import { useRealtimeInbox } from '../hooks/useRealtimeInbox.js'
import { useInboxStore } from '../stores/inboxStore.js'

const leftSections = [
  { label: 'Your inbox', count: 4 },
  { label: 'Mentions', count: 0 },
  { label: 'Created by you', count: 0 },
  { label: 'All', count: 4, active: true },
  { label: 'Unassigned', count: 0 },
  { label: 'Spam', count: 0 },
  { label: 'Dashboard' },
]

const finForServiceOptions = [
  { label: 'All conversations', icon: ListFilter },
  { label: 'Resolved', icon: Folder },
  { label: 'Needs teammate input', icon: UserRoundPlus },
  { label: 'Escalated & Handoff', icon: Handshake },
  { label: 'Pending', icon: HelpCircle },
  { label: 'Spam', icon: ShieldAlert },
]

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

export default function InboxPage() {
  
  const organizationId = import.meta.env.VITE_TEST_ORGANIZATION_ID?.trim() ?? ''
  const conversations = useInboxStore((state) => state.conversations)
  const activeConversationId = useInboxStore((state) => state.activeConversationId)
  const messagesByConversationId = useInboxStore((state) => state.messagesByConversationId)
  const setConversations = useInboxStore((state) => state.setConversations)
  const setActiveConversationId = useInboxStore((state) => state.setActiveConversationId)
  const setMessagesForConversation = useInboxStore((state) => state.setMessagesForConversation)
  const setTypingState = useInboxStore((state) => state.setTypingState)

  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState('')

  useRealtimeInbox({
    organizationId,
    userId: 'de3bc97d-da3b-42be-8900-39ae7d828089',
  })

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )
  const messages = messagesByConversationId[activeConversationId] ?? []

  const openCount = useMemo(
    () => conversations.filter((item) => item.status === 'open').length,
    [conversations],
  )

  const loadConversations = useCallback(async () => {
    if (!organizationId) return
    setLoadingConversations(true)
    setError('')
    try {
      const response = await apiFetch(`/api/conversations?organizationId=${organizationId}&page=1&pageSize=50`)
      setConversations(response?.items ?? [])
    } catch (err) {
      setError(err?.message || 'Failed to load conversations.')
    } finally {
      setLoadingConversations(false)
    }
  }, [organizationId, setConversations])

  const loadMessages = useCallback(
    async (conversationId) => {
      if (!organizationId || !conversationId) return
      setLoadingMessages(true)
      setError('')
      try {
        const response = await apiFetch(
          `/api/conversations/${conversationId}/messages?organizationId=${organizationId}&page=1&pageSize=100`,
        )
        setMessagesForConversation(conversationId, response?.items ?? [])
      } catch (err) {
        setError(err?.message || 'Failed to load messages.')
      } finally {
        setLoadingMessages(false)
      }
    },
    [organizationId, setMessagesForConversation],
  )

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!activeConversationId) {
      return
    }
    loadMessages(activeConversationId)
  }, [activeConversationId, loadMessages])

  useEffect(() => {
    if (!activeConversationId) return
    setTypingState(activeConversationId, [])
  }, [activeConversationId, setTypingState])

  const conversationView = conversations.map(toConversationViewModel)

  return (
    <main className="h-screen overflow-hidden bg-[#0f1422] text-slate-100">
      <div className="grid h-screen grid-cols-[260px_1fr_2fr_1.1fr] gap-0">
        <aside className="border-r border-[#27314a] bg-[#121a2b] p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Inbox</h2>
            <button className="rounded-md bg-[#1b2741] p-1.5">
              <Sparkles size={14} />
            </button>
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-[#0e1526] px-2 py-2 text-sm text-slate-300">
            <Search size={14} /> Search
          </div>
          <div className="space-y-1 text-sm">
            {leftSections.map((item) => (
              <div
                key={item.label}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
                  item.active ? 'bg-[#1a2440] text-white' : 'text-slate-300'
                }`}
              >
                <span>{item.label}</span>
                {item.count != null ? <span className="text-xs text-slate-400">{item.count}</span> : null}
              </div>
            ))}
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
        </aside>

        <section className="border-r border-[#27314a] bg-[#101729]">
          <div className="border-b border-[#27314a] px-4 py-3">
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

          <div className="px-4 py-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full border border-[#3a4b6f] bg-[#18233b] px-2.5 py-1 text-[12px] font-semibold text-white">
                {loadingConversations ? 'Loading...' : `${openCount} Open`}
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
                <article
                  key={item.id}
                  onClick={() => setActiveConversationId(item.id)}
                  className={`border-b border-[#27314a] px-1 py-3 last:border-b-0 ${
                    item.id === activeConversationId ? 'rounded-xl border border-[#384b70] bg-[#1a2337]' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">
                      {item.channel}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-[#d8deef]">{item.title}</p>
                        {item.title.startsWith('Email') ? <Star size={14} className="fill-yellow-400 text-yellow-400" /> : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-300">{item.body}</p>
                    </div>
                    <span className="text-xs text-slate-300">{item.time}</span>
                  </div>
                </article>
              ))}
              {!loadingConversations && conversationView.length === 0 ? (
                <div className="px-1 py-3 text-sm text-slate-400">
                  {organizationId ? 'No conversations found.' : 'Set VITE_TEST_ORGANIZATION_ID to load conversations.'}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="flex relative flex-col border-r border-[#27314a] bg-[#181f32]">
          <div className="flex items-center justify-between border-b border-[#27314a] px-3 py-4">
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
<div>

          <div className="flex-1 overflow-auto h-[400px] px-3 py-3">
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

            {loadingMessages ? <p className="mt-4 text-sm text-slate-300">Loading messages...</p> : null}
            {!loadingMessages && messages.length === 0 ? (
              <p className="mt-4 text-sm text-slate-300">No messages yet.</p>
            ) : null}

            {messages.map((message) => (
              <div key={message.id} className="mt-4 flex items-end justify-between">
                <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#4169b2] text-xs font-bold">
                  {(message.sender_type ?? 'c').slice(0, 1).toUpperCase()}
                </div>
                <div className="max-w-[75%] rounded-2xl bg-[#334680] px-4 py-2 text-sm">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs text-slate-300">
                    {message.sender_type} • {getRelativeTimeLabel(message.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
</div>


          <div className="mx-3 mb-3 absolute bottom-18 left-0 right-0 rounded-xl border border-[#2b3652] bg-[#1a2338] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MessageSquare size={14} /> Reply <ChevronDown size={14} />
            </div>
            <p className="mb-6 text-sm text-slate-400">Use Ctr+K for shortcuts</p>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>⚡</span>
              <span>Send</span>
            </div>
          </div>
        </section>

        <aside className="bg-[#141b2d]  text-sm">
          <div className="p-4  flex gap-4 border-b border-[#27314a] ">
            <button className="text-lg text-white">Details</button>
            <button className="text-lg text-slate-400">Copilot</button>
          </div>
          <div className="space-y-3 p-4 text-slate-300">
            <div className="flex items-center justify-between"><span>Assignee</span><span className="text-white">{selectedConversation?.assigned_to_member_id ? selectedConversation.assigned_to_member_id.slice(0, 8) : 'Unassigned'}</span></div>
            <div className="flex items-center justify-between"><span>Team inbox</span><span className="text-white">{selectedConversation?.status ?? 'Unassigned'}</span></div>
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
