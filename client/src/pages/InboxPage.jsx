import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  CircleDot,
  CircleUserRound,
  Clock3,
  Ellipsis,
  Inbox,
  Link2,
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
  Star,
  Users,
  X,
  CheckCircle2,
  Archive,
} from 'lucide-react'
import { apiFetch } from '../services/api.js'
import {
  createSendMessage,
  getMessageDeliveryStatus,
  validateOutboundMessage,
} from '../services/conversationSendMessage.js'
import { createSendInternalNote } from '../services/conversationInternalNote.js'
import { ComposerMentionMenu } from '../components/inbox/ComposerMentionMenu.jsx'
import { useComposerMentions } from '../hooks/useComposerMentions.js'
import { useAuth } from '../hooks/useAuth.js'
import { useInboxPeriodicSync } from '../hooks/useInboxPeriodicSync.js'
import { useRealtimeInbox } from '../hooks/useRealtimeInbox.js'
import { useAgentPresence } from '../hooks/useAgentPresence.js'
import { formatTypingIndicator, useTypingPresence } from '../hooks/useTypingPresence.js'
import { RestrictedControl } from '../components/RestrictedControl.jsx'
import { useOrgPermissionsContext } from '../context/OrgPermissionsContext.jsx'
import { useInboxConversationPermissions } from '../hooks/useInboxConversationPermissions.js'
import { InboxSidebar } from '../components/InboxSidebar.jsx'
import { ConversationTagsPanel } from '../components/inbox/ConversationTagsPanel.jsx'
import AssignmentAuditHint from '../components/inbox/AssignmentAuditHint.jsx'
import { fetchConversationAssignmentAudit } from '../services/assignmentApi.js'
import { InboxCopilotPanel } from '../components/inbox/InboxCopilotPanel.jsx'
import { ComposerAiMenu } from '../components/inbox/ComposerAiMenu.jsx'
import { ComposerAiPreviewModal } from '../components/inbox/ComposerAiPreviewModal.jsx'
import { postAiFeedback, rewrite, translate } from '../services/aiApi.js'
import {
  findLastCustomerMessageId,
  inferSuggestFeedbackAction,
} from '../utils/inboxAiLineage.js'
import { fetchOrgAiSettings } from '../services/orgSettingsApi.js'
import { fetchOrgTags } from '../services/tagsApi.js'
import {
  assignConversationToMember,
  assignConversationToTeamInbox,
  patchConversation,
} from '../services/conversationsApi.js'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { useInboxSidebarActions } from '../hooks/useInboxSidebarActions.js'
import {
  conversationCountsUrl,
  conversationMembersUrl,
  conversationMessagesUrl,
  patchConversationSpamUrl,
} from '../services/inboxApi.js'
import { fetchOrgInboxes, transferConversationInbox } from '../services/inboxesApi.js'
import { fetchOrgChannels } from '../services/orgWorkspaceApi.js'
import {
  getConversationAutomationBadges,
  getConversationLifecycleDetailHint,
  getConversationLifecycleListBadges,
  primaryMentionHandle,
} from '@ai-support/shared'
import { fetchOrgLifecycleSettings } from '../services/lifecycleSettingsApi.js'
import { useInboxStore } from '../stores/inboxStore.js'
import { INBOX_SIDEBAR_FILTERS } from '../config/inboxFilters.js'
import {
  inboxListParamsReady,
  mergeInboxSearchParams,
  parseInboxListParams,
} from '../utils/inboxUrlParams.js'
import {
  CONVERSATION_ASSIGNMENT_TYPES,
  CONVERSATION_PRIORITIES,
  CONVERSATION_WORKSPACE_STATUSES,
} from '@ai-support/shared'

const MESSAGE_LIST_SCROLL_BOTTOM_PX = 80

/** Avatar + bubble styling for `messages.sender_type` (customer, agent, system, ai, internal_note). */
function messageSenderInitial(senderType) {
  const s = typeof senderType === 'string' ? senderType : ''
  const map = { customer: 'C', agent: 'A', system: 'S', ai: 'I', internal_note: 'N' }
  if (map[s]) return map[s]
  return s ? s.slice(0, 1).toUpperCase() : '?'
}

function messageAvatarClass(senderType) {
  const st = typeof senderType === 'string' ? senderType : 'customer'
  if (st === 'customer') return 'bg-emerald-800'
  if (st === 'agent' || st === 'internal_note') return 'bg-[#4169b2]'
  if (st === 'ai') return 'bg-violet-700'
  if (st === 'system') return 'bg-slate-600'
  return 'bg-[#4169b2]'
}

function messageBubbleClassName(senderType, delivery) {
  if (delivery === 'failed') return 'border border-red-400/70 bg-[#402a38]'
  if (delivery === 'sending') return 'border border-amber-400/40 bg-[#2f3a5c]'
  const st = typeof senderType === 'string' ? senderType : 'customer'
  if (st === 'internal_note') return 'border border-amber-500/35 bg-[#2d2418]'
  if (st === 'system') return 'bg-[#242a38]'
  if (st === 'agent') return 'bg-emerald-700'
  if (st === 'customer') return 'bg-[#334680]'
  if (st === 'ai') return 'border border-violet-500/35 bg-[#2a2438]'
  return 'bg-[#334680]'
}

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
    time: getRelativeTimeLabel(item.last_message_at),
    channel,
    automationBadges: [
      ...getConversationLifecycleListBadges(item),
      ...getConversationAutomationBadges(item.metadata),
    ],
  }
}

const BADGE_TONE_CLASS = {
  warning: 'border-amber-500/40 bg-amber-950/50 text-amber-200',
  info: 'border-sky-500/40 bg-sky-950/50 text-sky-200',
  success: 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200',
  neutral: 'border-[#3a4b6f] bg-[#18233b] text-slate-300',
}

const ConversationListRow = memo(
  function ConversationListRow({
    conversationId,
    title,
    timeLabel,
    channelLetter,
    automationBadges = [],
    isActive,
    onSelect,
  }) {
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
            {automationBadges.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {automationBadges.map((badge) => (
                  <span
                    key={badge.id}
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      BADGE_TONE_CLASS[badge.tone] ?? BADGE_TONE_CLASS.neutral
                    }`}
                  >
                    {badge.label}
                  </span>
                ))}
              </div>
            ) : null}
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
    (prev.automationBadges ?? [])
      .map((b) => b.id)
      .join(',') ===
      (next.automationBadges ?? []).map((b) => b.id).join(',') &&
    prev.isActive === next.isActive &&
    prev.onSelect === next.onSelect,
)

function InboxChatEmptyState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#1a2338] text-slate-300">
        <MessageSquare size={28} aria-hidden />
      </div>
      <h3 className="text-lg font-semibold text-white">No conversation selected</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-400">
        Choose a conversation from the list to view messages and reply.
      </p>
    </div>
  )
}

export default function InboxPage() {
  const { orgId: orgFromRoute } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const inboxListParams = useMemo(() => parseInboxListParams(searchParams), [searchParams])
  const conversationIdFromUrl = inboxListParams.conversation
  /** Active thread is driven by `?conversation=` in the URL. */
  const activeConversationId = conversationIdFromUrl
  const listParamsKey = useMemo(
    () =>
      `${inboxListParams.filter}|${inboxListParams.inbox ?? ''}|${inboxListParams.memberId ?? ''}|${inboxListParams.channelId ?? ''}|${inboxListParams.page}|${inboxListParams.pageSize}`,
    [inboxListParams],
  )
  const organizationId =
    (typeof orgFromRoute === 'string' && orgFromRoute.trim()) ||
    ''
  const { user } = useAuth()
  const { organizations } = useOrganizationContext()
  const conversations = useInboxStore((state) => state.conversations)
  const conversationPagination = useInboxStore((state) => state.conversationPagination)
  const messagesByConversationId = useInboxStore((state) => state.messagesByConversationId)
  const activeViewersByConversationId = useInboxStore((state) => state.activeViewersByConversationId)
  const typingState = useInboxStore((state) => state.typingState)
  const setActiveConversationId = useInboxStore((state) => state.setActiveConversationId)
  const setMessagesForConversation = useInboxStore((state) => state.setMessagesForConversation)
  const setFilterCounts = useInboxStore((state) => state.setFilterCounts)
  const invalidateConversationFilterCache = useInboxStore((state) => state.invalidateConversationFilterCache)
  const upsertConversation = useInboxStore((state) => state.upsertConversation)

  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [draftMessage, setDraftMessage] = useState('')
  const [error, setError] = useState('')
  const [orgMembers, setOrgMembers] = useState([])
  const [orgTags, setOrgTags] = useState([])
  const [assigningConversation, setAssigningConversation] = useState(false)
  const [assignError, setAssignError] = useState('')
  const [assignMenuOpen, setAssignMenuOpen] = useState(false)
  const [teamInboxAssignMenuOpen, setTeamInboxAssignMenuOpen] = useState(false)
  const [conversationDetailSaving, setConversationDetailSaving] = useState(false)
  const [spamUpdating, setSpamUpdating] = useState(false)
  const [sidebarTab, setSidebarTab] = useState('details')
  const [orgAiSettings, setOrgAiSettings] = useState(null)
  const [assignmentAudit, setAssignmentAudit] = useState(null)
  /** @type {[{ runId: string, sourceText: string, parentMessageId: string | null } | null]} */
  const [pendingSuggestLineage, setPendingSuggestLineage] = useState(null)
  const [aiPreview, setAiPreview] = useState(null)
  /** @type {['reply' | 'internal_note', import('react').Dispatch<import('react').SetStateAction<'reply' | 'internal_note'>>]} */
  const [composerMode, setComposerMode] = useState('reply')
  const [orgInboxes, setOrgInboxes] = useState([])
  const [orgChannels, setOrgChannels] = useState([])
  const [loadingInboxes, setLoadingInboxes] = useState(false)
  const [transferMenuOpen, setTransferMenuOpen] = useState(false)
  const [transferring, setTransferring] = useState(false)

  const setActiveInboxId = useInboxStore((state) => state.setActiveInboxId)
  const setAccessibleInboxIds = useInboxStore((state) => state.setAccessibleInboxIds)

  const messagesScrollRef = useRef(null)
  const composerTextareaRef = useRef(null)
  const composerSelectionRef = useRef({ start: 0, end: 0 })
  const assignMenuRef = useRef(null)
  const teamInboxAssignMenuRef = useRef(null)
  const stickToBottomRef = useRef(true)

  const {
    runConversationQuery,
    loadFilterCounts,
    mentionCue,
    filterCounts,
  } = useInboxSidebarActions(organizationId, {
    setLoadingConversations,
    setError,
    silentFilterRefetch: false,
    listParams: inboxListParams,
  })

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

  useEffect(() => {
    if (!organizationId) {
      setOrgTags([])
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchOrgTags(organizationId)
        if (!cancelled) setOrgTags(res?.tags ?? [])
      } catch {
        if (!cancelled) setOrgTags([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  useEffect(() => {
    if (!organizationId) {
      setOrgAiSettings(null)
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchOrgAiSettings(organizationId)
        if (!cancelled) setOrgAiSettings(data?.ai ?? null)
      } catch {
        if (!cancelled) setOrgAiSettings(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  const activeMessages = messagesByConversationId[activeConversationId] ?? []

  const handleCopilotInsertReply = useCallback(
    (text, meta) => {
      const next = typeof text === 'string' ? text.trim() : ''
      if (!next) return
      setDraftMessage(next)
      if (meta?.runId) {
        setPendingSuggestLineage({
          runId: meta.runId,
          sourceText: meta.sourceText ?? next,
          parentMessageId: findLastCustomerMessageId(activeMessages),
        })
      }
    },
    [activeMessages],
  )

  useEffect(() => {
    setPendingSuggestLineage(null)
    setAiPreview(null)
    setComposerMode('reply')
  }, [activeConversationId])

  const activeConversationAiEnabled = useMemo(() => {
    const row = conversations.find((item) => item.id === activeConversationId)
    return row?.ai_enabled
  }, [conversations, activeConversationId])

  const { can, deny, loading: permissionsLoading } = useOrgPermissionsContext()

  const composerAiDisabledReason = useMemo(() => {
    if (!organizationId) return 'No organization selected.'
    if (!activeConversationId) return 'Select a conversation first.'
    if (permissionsLoading) return 'Loading permissions…'
    const copilotDeny = deny('ai.use_copilot')
    if (copilotDeny) return copilotDeny
    if (orgAiSettings?.ai_enabled === false) return 'AI is disabled for this organization.'
    if (orgAiSettings?.assist_enabled === false) return 'AI assist is turned off.'
    if (activeConversationAiEnabled === false) return 'AI is disabled for this conversation.'
    return null
  }, [
    organizationId,
    activeConversationId,
    orgAiSettings,
    activeConversationAiEnabled,
    permissionsLoading,
    deny,
  ])

  const captureComposerSelection = useCallback(() => {
    const el = composerTextareaRef.current
    if (!el) {
      composerSelectionRef.current = { start: 0, end: draftMessage.length }
      return
    }
    composerSelectionRef.current = { start: el.selectionStart, end: el.selectionEnd }
  }, [draftMessage.length])

  const getComposerTargetText = useCallback(() => {
    const { start, end } = composerSelectionRef.current
    if (start !== end) return draftMessage.slice(start, end)
    return draftMessage.trim()
  }, [draftMessage])

  const applyComposerAiReplace = useCallback(
    (proposed, meta) => {
      const text = typeof proposed === 'string' ? proposed : ''
      if (!text.trim()) return
      const { start, end } = composerSelectionRef.current
      const full = draftMessage
      const next =
        start !== end ? `${full.slice(0, start)}${text}${full.slice(end)}` : text
      setDraftMessage(next)
      if (meta?.runId) {
        setPendingSuggestLineage({
          runId: meta.runId,
          sourceText: meta.sourceText ?? text,
          parentMessageId: findLastCustomerMessageId(activeMessages),
        })
      }
    },
    [draftMessage, activeMessages],
  )

  const runComposerTranslate = useCallback(
    async (targetLanguage) => {
      if (!organizationId || composerAiDisabledReason) return
      captureComposerSelection()
      const source = getComposerTargetText()
      if (!source.trim()) {
        setError('Type a message (or select text) before translating.')
        return
      }
      setAiPreview({
        mode: 'translate',
        title: `Translate to ${targetLanguage}`,
        original: source,
        proposed: '',
        loading: true,
        runId: null,
      })
      setError('')
      try {
        const res = await translate(organizationId, { text: source, targetLanguage })
        const proposed = res.translation ?? res.text ?? ''
        setAiPreview((prev) =>
          prev
            ? {
                ...prev,
                proposed,
                loading: false,
                runId: res.runId ?? null,
              }
            : null,
        )
      } catch (err) {
        setAiPreview(null)
        setError(err?.message || 'Translation failed.')
      }
    },
    [
      organizationId,
      composerAiDisabledReason,
      captureComposerSelection,
      getComposerTargetText,
    ],
  )

  const runComposerRewrite = useCallback(
    async (tone) => {
      if (!organizationId || composerAiDisabledReason) return
      captureComposerSelection()
      const source = getComposerTargetText()
      if (!source.trim()) {
        setError('Type a message (or select text) before rewriting.')
        return
      }
      setAiPreview({
        mode: 'rewrite',
        title: `Rewrite (${tone})`,
        original: source,
        proposed: '',
        loading: true,
        runId: null,
      })
      setError('')
      try {
        const res = await rewrite(organizationId, { text: source, tone })
        const proposed = res.rewritten ?? res.text ?? ''
        setAiPreview((prev) =>
          prev
            ? {
                ...prev,
                proposed,
                loading: false,
                runId: res.runId ?? null,
              }
            : null,
        )
      } catch (err) {
        setAiPreview(null)
        setError(err?.message || 'Rewrite failed.')
      }
    },
    [organizationId, composerAiDisabledReason, captureComposerSelection, getComposerTargetText],
  )

  const isOrgAdmin = true

  const myMembership = useMemo(() => {
    const fromMembers = orgMembers.find((m) => m.userId === user?.id)
    if (fromMembers) return fromMembers
    const orgRow = organizations.find((o) => o.orgId === organizationId)
    if (orgRow?.membershipId && user?.id) {
      return {
        id: orgRow.membershipId,
        userId: user.id,
        role: orgRow.role,
        displayName: 'You',
        email: typeof user.email === 'string' ? user.email : null,
      }
    }
    return null
  }, [orgMembers, organizations, organizationId, user?.id, user?.email])

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
        mentionMembers: [],
      }),
    [organizationId, user?.id],
  )

  const sendInternalNote = useMemo(
    () =>
      createSendInternalNote({
        organizationId,
        senderUserId: user?.id ?? null,
        apiFetch,
      }),
    [organizationId, user?.id],
  )

  const mentionMembersExcludingSelf = useMemo(
    () => mentionMembersForParse.filter((m) => m.userId !== user?.id),
    [mentionMembersForParse, user?.id],
  )

  const {
    mentionMenuOpen,
    mentionQuery,
    mentionHighlight,
    handleChange: handleDraftChange,
    handleSelect: handleMentionSelect,
    handleKeyDown: handleMentionKeyDown,
    closeMentionMenu,
  } = useComposerMentions({
    value: draftMessage,
    onChange: setDraftMessage,
    textareaRef: composerTextareaRef,
    enabled: composerMode === 'internal_note',
  })

  const mentionFilteredCount = useMemo(() => {
    const q = (mentionQuery ?? '').trim().toLowerCase()
    const list = mentionMembersExcludingSelf
    if (!q) return Math.min(list.length, 12)
    return list
      .filter((m) => {
        const handle = primaryMentionHandle(m)
        const name = (m.displayName ?? '').toLowerCase()
        const email = (m.email ?? '').toLowerCase()
        return handle.includes(q) || name.includes(q) || email.includes(q)
      })
      .slice(0, 12).length
  }, [mentionMembersExcludingSelf, mentionQuery])

  useEffect(() => {
    closeMentionMenu()
  }, [activeConversationId, closeMentionMenu])

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
    const { filter, page, pageSize } = parseInboxListParams(searchParams)
    await runConversationQuery(filter, { silent: true, page, pageSize })
    await loadFilterCounts()
    const convId = conversationIdFromUrl
    if (convId) {
      await loadMessages(convId, { silent: true })
    }
  }, [runConversationQuery, loadFilterCounts, loadMessages, searchParams, conversationIdFromUrl])

  useRealtimeInbox({
    organizationId,
    userId: user?.id ?? '',
    onReconnect: handleRealtimeReconnect,
  })

  useAgentPresence({
    organizationId,
    enabled: Boolean(organizationId && user?.id),
    presence: 'online',
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
  const inboxPerms = useInboxConversationPermissions({
    can,
    myMemberId: myMembership?.id,
    conversation: selectedConversation,
  })

  const messages = useMemo(
    () => messagesByConversationId[activeConversationId] ?? [],
    [activeConversationId, messagesByConversationId],
  )

  const lastCustomerFacingSender = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const st = messages[i]?.sender_type
      if (st === 'system') continue
      return st ?? null
    }
    return null
  }, [messages])

  const [orgLifecycleSettings, setOrgLifecycleSettings] = useState(null)

  useEffect(() => {
    if (!organizationId) {
      setOrgLifecycleSettings(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchOrgLifecycleSettings(organizationId)
        if (!cancelled) setOrgLifecycleSettings(res?.lifecycle ?? null)
      } catch {
        if (!cancelled) setOrgLifecycleSettings(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  const suggestWaitingOnCustomer = useMemo(() => {
    const status = selectedConversation?.status ?? 'open'
    const agentLast =
      lastCustomerFacingSender === 'agent' || lastCustomerFacingSender === 'ai'
    return agentLast && (status === 'open' || status === 'pending')
  }, [lastCustomerFacingSender, selectedConversation?.status])

  const lifecycleDetailHint = useMemo(
    () => getConversationLifecycleDetailHint(selectedConversation, orgLifecycleSettings),
    [selectedConversation, orgLifecycleSettings],
  )

  const assigneeLabel = useMemo(() => {
    const mid = selectedConversation?.assigned_to_member_id
    if (!mid) return 'Unassigned'
    if (myMembership?.id === mid) return 'You'
    return membersByMemberId.get(mid)?.displayName ?? `${mid.slice(0, 8)}…`
  }, [selectedConversation?.assigned_to_member_id, myMembership?.id, membersByMemberId])

  const teamInboxLabel = useMemo(() => {
    const tid = selectedConversation?.team_inbox_id
    if (!tid) return 'None'
    return orgInboxes.find((ib) => ib.id === tid)?.name ?? `${tid.slice(0, 8)}…`
  }, [selectedConversation?.team_inbox_id, orgInboxes])

  const sortedOrgInboxesForAssign = useMemo(() => {
    return [...orgInboxes].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }),
    )
  }, [orgInboxes])

  const sortedOrgMembersForAssign = useMemo(() => {
    return [...orgMembers].sort((a, b) =>
      (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '', undefined, {
        sensitivity: 'base',
      }),
    )
  }, [orgMembers])

  useEffect(() => {
    if (!organizationId || !activeConversationId) {
      setAssignmentAudit(null)
      return undefined
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchConversationAssignmentAudit(organizationId, activeConversationId)
        if (!cancelled) setAssignmentAudit(res?.log ?? null)
      } catch {
        if (!cancelled) setAssignmentAudit(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    organizationId,
    activeConversationId,
    selectedConversation?.assigned_to_member_id,
    selectedConversation?.assignment_type,
    selectedConversation?.team_inbox_id,
  ])

  useEffect(() => {
    setAssignMenuOpen(false)
    setTeamInboxAssignMenuOpen(false)
  }, [activeConversationId])

  useEffect(() => {
    if (!assignMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (assignMenuRef.current && !assignMenuRef.current.contains(event.target)) {
        setAssignMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [assignMenuOpen])

  useEffect(() => {
    if (!teamInboxAssignMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (
        teamInboxAssignMenuRef.current &&
        !teamInboxAssignMenuRef.current.contains(event.target)
      ) {
        setTeamInboxAssignMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [teamInboxAssignMenuOpen])

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

  const patchInboxUrl = useCallback(
    (updates) => {
      setSearchParams((prev) => mergeInboxSearchParams(prev, updates), { replace: true })
    },
    [setSearchParams],
  )

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    setLoadingInboxes(true)
    ;(async () => {
      try {
        const [inboxRes, channelRes] = await Promise.all([
          fetchOrgInboxes(organizationId),
          fetchOrgChannels(organizationId).catch(() => ({ channels: [] })),
        ])
        if (cancelled) return
        const list = (inboxRes?.inboxes ?? []).filter((ib) => ib.status === 'active')
        setOrgInboxes(list)
        setOrgChannels(channelRes?.channels ?? [])
        setAccessibleInboxIds(list.map((i) => i.id))
        if (inboxListParams.filter === 'team_inbox' && inboxListParams.inbox) {
          setActiveInboxId(inboxListParams.inbox)
        }
      } catch {
        if (!cancelled) {
          setOrgInboxes([])
          setOrgChannels([])
        }
      } finally {
        if (!cancelled) setLoadingInboxes(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, setActiveInboxId, setAccessibleInboxIds, inboxListParams.filter, inboxListParams.inbox])

  useEffect(() => {
    if (!organizationId) return
    invalidateConversationFilterCache()
  }, [organizationId, invalidateConversationFilterCache])

  useEffect(() => {
    if (!organizationId) return
    if (inboxListParamsReady(searchParams)) return
    setSearchParams((prev) => mergeInboxSearchParams(prev, {}), { replace: true })
  }, [organizationId, searchParams, setSearchParams])

  useEffect(() => {
    if (!organizationId || !inboxListParamsReady(searchParams)) return undefined

    const { filter, page, pageSize, inbox } = inboxListParams
    useInboxStore.setState({
      activeFilter: filter,
      activeTagId: null,
      activeAiIntent: null,
      activeInboxId: filter === 'team_inbox' ? inbox : '',
    })

    let cancelled = false
    ;(async () => {
      setError('')
      try {
        await runConversationQuery(filter, { page, pageSize })
        if (cancelled) return
        const counts = await apiFetch(conversationCountsUrl(organizationId))
        if (!cancelled) setFilterCounts(counts)
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load conversations.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, listParamsKey, searchParams, inboxListParams, runConversationQuery, setFilterCounts])

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
      if (!organizationId) {
        setAssignError('Missing organization in URL. Open inbox from /org/:orgId/inbox.')
        return
      }
      if (!conversationId) {
        setAssignError('No conversation selected.')
        return
      }
      setAssigningConversation(true)
      setAssignError('')
      setError('')
      try {
        const res = await assignConversationToMember(organizationId, conversationId, memberId)
        const updated = res?.conversation
        if (!updated?.id) {
          throw new Error('Server did not return an updated conversation.')
        }
        upsertConversation(updated)
        // Do not refetch the list here: setConversationsPage would replace items and drop
        // the active thread when the current filter no longer matches (e.g. unassigned).
        await loadFilterCounts()
      } catch (err) {
        const message = err?.message || 'Could not update assignment.'
        setAssignError(message)
        setError(message)
      } finally {
        setAssigningConversation(false)
      }
    },
    [organizationId, upsertConversation, loadFilterCounts],
  )

  const assignTeamInbox = useCallback(
    async (conversationId, inboxId) => {
      if (!organizationId) {
        setAssignError('Missing organization in URL. Open inbox from /org/:orgId/inbox.')
        return
      }
      if (!conversationId) {
        setAssignError('No conversation selected.')
        return
      }
      setAssigningConversation(true)
      setAssignError('')
      setError('')
      try {
        const res = await assignConversationToTeamInbox(organizationId, conversationId, inboxId)
        const updated = res?.conversation
        if (!updated?.id) {
          throw new Error('Server did not return an updated conversation.')
        }
        upsertConversation(updated)
        await loadFilterCounts()
      } catch (err) {
        const message = err?.message || 'Could not update team inbox.'
        setAssignError(message)
        setError(message)
      } finally {
        setAssigningConversation(false)
      }
    },
    [organizationId, upsertConversation, loadFilterCounts],
  )

  const handleSelectPrimaryFilter = useCallback(
    (filterType) => {
      patchInboxUrl({
        filter: filterType,
        page: 1,
        pageSize: inboxListParams.pageSize,
        conversation: null,
        inbox: null,
        memberId: null,
        channelId: null,
      })
    },
    [patchInboxUrl, inboxListParams.pageSize],
  )

  const handleSelectTeamInbox = useCallback(
    (inboxId) => {
      setActiveInboxId(inboxId)
      patchInboxUrl({
        filter: 'team_inbox',
        inbox: inboxId,
        page: 1,
        pageSize: inboxListParams.pageSize,
        conversation: null,
        memberId: null,
        channelId: null,
      })
    },
    [patchInboxUrl, inboxListParams.pageSize, setActiveInboxId],
  )

  const handleSelectTeammate = useCallback(
    (memberId) => {
      patchInboxUrl({
        filter: 'teammate',
        memberId,
        page: 1,
        pageSize: inboxListParams.pageSize,
        conversation: null,
        inbox: null,
        channelId: null,
      })
    },
    [patchInboxUrl, inboxListParams.pageSize],
  )

  const handleSelectChannel = useCallback(
    (channelId) => {
      patchInboxUrl({
        filter: 'channel',
        channelId,
        page: 1,
        pageSize: inboxListParams.pageSize,
        conversation: null,
        inbox: null,
        memberId: null,
      })
    },
    [patchInboxUrl, inboxListParams.pageSize],
  )

  const listViewTitle = useMemo(() => {
    const { filter, inbox, memberId, channelId } = inboxListParams
    if (filter === 'team_inbox' && inbox) {
      const ib = orgInboxes.find((i) => i.id === inbox)
      return ib?.name ? `${ib.name} inbox` : 'Team inbox'
    }
    if (filter === 'teammate' && memberId) {
      const m = orgMembers.find((x) => x.id === memberId)
      return m?.displayName || m?.email || 'Teammate'
    }
    if (filter === 'channel' && channelId) {
      const ch = orgChannels.find((c) => c.id === channelId)
      return ch?.name || ch?.type || 'Channel'
    }
    const primary = INBOX_SIDEBAR_FILTERS.find((f) => f.id === filter)
    return primary?.label ?? 'Conversations'
  }, [inboxListParams, orgInboxes, orgMembers, orgChannels])

  const handleSelectConversation = useCallback(
    (id) => {
      if (organizationId && id) {
        setSearchParams((prev) => mergeInboxSearchParams(prev, { conversation: id }), { replace: true })
      }
    },
    [organizationId, setSearchParams],
  )

  useEffect(() => {
    if (!organizationId) return
    const storeId = useInboxStore.getState().activeConversationId
    if (conversationIdFromUrl === storeId) return
    setActiveConversationId(conversationIdFromUrl)
  }, [organizationId, conversationIdFromUrl, setActiveConversationId])

  useEffect(() => {
    if (conversationIdFromUrl) return
    setDraftMessage('')
    setPendingSuggestLineage(null)
    setAiPreview(null)
    setError('')
  }, [conversationIdFromUrl])

  const patchConversationDetails = useCallback(
    async (patch) => {
      if (!organizationId || !activeConversationId) return
      setConversationDetailSaving(true)
      setError('')
      try {
        const res = await patchConversation(organizationId, activeConversationId, patch)
        const updated = res?.conversation
        if (updated) upsertConversation(updated)
        const keys = Object.keys(patch ?? {})
        const assignmentOnly =
          keys.length > 0 &&
          keys.every(
            (k) => k === 'assignedToMemberId' || k === 'assignmentType' || k === 'teamInboxId',
          )
        if (!assignmentOnly) {
          const { filter: filterNow, page, pageSize } = parseInboxListParams(searchParams)
          await runConversationQuery(filterNow, { silent: true, page, pageSize })
        }
        await loadFilterCounts()
      } catch (err) {
        setError(err?.message || 'Could not update conversation.')
      } finally {
        setConversationDetailSaving(false)
      }
    },
    [organizationId, activeConversationId, upsertConversation, runConversationQuery, loadFilterCounts, searchParams],
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
        const { filter: filterNow, page, pageSize } = parseInboxListParams(searchParams)
        await runConversationQuery(filterNow, { silent: true, page, pageSize })
        await loadFilterCounts()
      } catch (err) {
        setError(err?.message || 'Could not update spam flag.')
      } finally {
        setSpamUpdating(false)
      }
    },
    [organizationId, upsertConversation, runConversationQuery, loadFilterCounts, searchParams],
  )

  const trimmedDraft = draftMessage.trim()
  const isInternalNoteMode = composerMode === 'internal_note'
  const canSendMessage =
    Boolean(activeConversationId && organizationId && trimmedDraft) &&
    !sendingMessage &&
    (isInternalNoteMode
      ? !inboxPerms.internalNote.restricted
      : !inboxPerms.reply.restricted)

  const handleSendMessage = useCallback(async () => {
    if (!activeConversationId || !organizationId) return

    const validated = validateOutboundMessage(draftMessage)
    if (!validated.ok) {
      setError(validated.error)
      return
    }

    const body = validated.content

    if (isInternalNoteMode) {
      setSendingMessage(true)
      setError('')
      setDraftMessage('')
      closeMentionMenu()
      try {
        const result = await sendInternalNote(activeConversationId, body)
        if (!result.ok && !result.skipped) {
          setError(result.error || 'Failed to post internal note.')
          setDraftMessage(body)
        }
      } finally {
        setSendingMessage(false)
      }
      return
    }

    stopTypingImmediately()

    const lineageSnapshot = pendingSuggestLineage

    setSendingMessage(true)
    setError('')
    setDraftMessage('')
    setPendingSuggestLineage(null)

    const sendOpts =
      lineageSnapshot?.runId
        ? {
            aiLineage: {
              isAiGenerated: true,
              aiRunId: lineageSnapshot.runId,
              parentMessageId: lineageSnapshot.parentMessageId,
            },
          }
        : undefined

    try {
      const result = await sendMessage(activeConversationId, body, sendOpts)

      if (!result.ok && !result.skipped) {
        setError(result.error || 'Failed to send message.')
        setDraftMessage(body)
        if (lineageSnapshot) setPendingSuggestLineage(lineageSnapshot)
      } else if (result.ok && lineageSnapshot?.runId) {
        const action = inferSuggestFeedbackAction(body, lineageSnapshot.sourceText)
        const messageId = result.message?.id ?? null
        try {
          await postAiFeedback(organizationId, {
            aiRunId: lineageSnapshot.runId,
            action,
            ...(messageId ? { messageId } : {}),
          })
        } catch (feedbackErr) {
          console.warn('[inbox] AI feedback failed:', feedbackErr?.message || feedbackErr)
        }
      }
    } finally {
      setSendingMessage(false)
    }
  }, [
    activeConversationId,
    draftMessage,
    organizationId,
    sendMessage,
    sendInternalNote,
    stopTypingImmediately,
    pendingSuggestLineage,
    isInternalNoteMode,
    closeMentionMenu,
  ])

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
      if (isInternalNoteMode && mentionMenuOpen && mentionFilteredCount > 0) {
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
          const q = (mentionQuery ?? '').trim().toLowerCase()
          const list = mentionMembersExcludingSelf
          const filtered = !q
            ? list.slice(0, 12)
            : list
                .filter((m) => {
                  const handle = primaryMentionHandle(m)
                  const name = (m.displayName ?? '').toLowerCase()
                  const email = (m.email ?? '').toLowerCase()
                  return handle.includes(q) || name.includes(q) || email.includes(q)
                })
                .slice(0, 12)
          const pick = filtered[mentionHighlight]
          if (pick) {
            event.preventDefault()
            handleMentionSelect(pick)
            return
          }
        }
        if (handleMentionKeyDown(event, mentionFilteredCount)) return
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!canSendMessage) return
        handleSendMessage()
      }
    },
    [
      canSendMessage,
      handleSendMessage,
      isInternalNoteMode,
      mentionMenuOpen,
      mentionFilteredCount,
      mentionQuery,
      mentionMembersExcludingSelf,
      mentionHighlight,
      handleMentionSelect,
      handleMentionKeyDown,
    ],
  )

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0f1422] text-slate-100">
      <div className="grid h-full min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.1fr)] gap-0 overflow-hidden">
        <InboxSidebar
          activeFilter={inboxListParams.filter}
          filterCounts={filterCounts}
          onSelectPrimaryFilter={handleSelectPrimaryFilter}
          onSelectTeamInbox={handleSelectTeamInbox}
          onSelectTeammate={handleSelectTeammate}
          onSelectChannel={handleSelectChannel}
          mentionCue={mentionCue}
          teamInboxes={orgInboxes}
          teammates={orgMembers}
          channels={orgChannels}
          activeInboxId={inboxListParams.inbox}
          activeMemberId={inboxListParams.memberId}
          activeChannelId={inboxListParams.channelId}
        />

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-[#27314a] bg-[#101729]">
          <div className="shrink-0 border-b border-[#27314a] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-lg font-semibold text-white">{listViewTitle}</h2>
              <button
                type="button"
                onClick={() => navigate(`/org/${organizationId}/search`)}
                className="shrink-0 rounded-full bg-[#1a2338] p-2 text-slate-200 hover:text-white"
                aria-label="Search conversations"
              >
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
                  timeLabel={item.time}
                  channelLetter={item.channel}
                  automationBadges={item.automationBadges}
                  isActive={item.id === activeConversationId}
                  onSelect={handleSelectConversation}
                />
              ))}
              {!loadingConversations && conversationView.length === 0 ? (
                <div className="px-1 py-3 text-sm text-slate-400">
                  No conversations found.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-[#27314a] bg-[#181f32]">
          {!activeConversationId ? (
            <>
              <div className="flex shrink-0 items-center justify-between border-b border-[#27314a] px-3 py-4">
                <h3 className="text-2xl font-semibold text-slate-400">Inbox</h3>
              </div>
              <InboxChatEmptyState />
            </>
          ) : (
            <>
          <div className="flex shrink-0 items-center justify-between border-b border-[#27314a] px-3 py-4">
            <h3 className="text-2xl font-semibold">{selectedConversation ? selectedConversation.source ?? 'Messenger' : 'Messenger'}</h3>
            <div className="relative flex items-center gap-2 text-slate-300">
              <Star size={14} />
              {can('conversations.transfer_inbox') ? (
                <>
                  <button
                    type="button"
                    className="rounded-full bg-[#2b3346] p-1.5"
                    aria-label="More actions"
                    onClick={() => setTransferMenuOpen((v) => !v)}
                  >
                    <Ellipsis size={14} />
                  </button>
                  {transferMenuOpen ? (
                    <div className="absolute right-0 top-8 z-20 min-w-[180px] rounded-lg border border-[#3a4b6f] bg-[#101729] py-1 shadow-lg">
                      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Transfer to inbox
                      </p>
                      {orgInboxes
                        .filter((ib) => ib.id !== selectedConversation?.inbox_id)
                        .map((ib) => (
                          <button
                            key={ib.id}
                            type="button"
                            disabled={transferring}
                            className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-[#1a2338] disabled:opacity-50"
                            onClick={async () => {
                              if (!organizationId || !activeConversationId) return
                              setTransferring(true)
                              setTransferMenuOpen(false)
                              try {
                                const res = await transferConversationInbox(
                                  organizationId,
                                  activeConversationId,
                                  ib.id,
                                )
                                if (res?.conversation) upsertConversation(res.conversation)
                                const stillAccessible = useInboxStore
                                  .getState()
                                  .accessibleInboxIds.includes(ib.id)
                                if (!stillAccessible) {
                                  patchInboxUrl({ inbox: ib.id, conversation: null })
                                }
                                await loadFilterCounts()
                              } catch (err) {
                                setError(err?.message || 'Transfer failed.')
                              } finally {
                                setTransferring(false)
                              }
                            }}
                          >
                            {ib.name}
                          </button>
                        ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <button type="button" className="rounded-full bg-[#2b3346] p-1.5" aria-hidden>
                  <Ellipsis size={14} />
                </button>
              )}
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
              Active viewers: {activeViewers.length} {"       "} {selectedConversation?.id} {" ------ "} {selectedConversation?.customer_id} 
            </div>
          ) : null}

          <div
            ref={messagesScrollRef}
            className="inbox-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-3 [scrollbar-gutter:stable]"
            onScroll={updateStickToBottom}
          >
              {error ? 
            <div className="rounded-xl border border-[#2a3654] bg-[#242c3f] p-4">
             
              <p className="mt-3 text-sm text-red-300">{error}</p> 
            </div>
              : null}

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
              const st = message.sender_type ?? 'customer'
              const isSystem = st === 'system'
              const isAgent = st === 'agent'
              const isInternalNote = st === 'internal_note'
              const isCustomer = st === 'customer'
              const showAgentDelivery = st === 'agent'
              const statusLabel =
                delivery === 'sending' ? 'Sending' : delivery === 'failed' ? 'Failed' : 'Sent'
              return (
                <div
                  key={message.id}
                  className={`mt-4 flex items-end gap-2 ${
                    isSystem
                      ? 'justify-center'
                      : isAgent || isInternalNote
                        ? 'justify-end'
                        : isCustomer
                          ? 'justify-start'
                          : 'justify-start'
                  }`}
                >
                  {!isAgent && !isInternalNote && !isSystem ? (
                    <div
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${messageAvatarClass(st)}`}
                    >
                      {messageSenderInitial(st)}
                    </div>
                  ) : null}
                  <div
                    className={`${isSystem ? 'max-w-[60%] px-3 py-1.5 text-xs' : 'max-w-[75%] px-4 py-2 text-sm'} rounded-2xl ${messageBubbleClassName(st, delivery)} ${
                      isSystem ? 'text-center' : ''
                    }`}
                  >
                    <p className="whitespace-pre-wrap">
                      <MessageContentRich text={message.content} />
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-slate-300">
                        {isInternalNote ? 'Internal note' : message.sender_type} •{' '}
                        {getRelativeTimeLabel(message.created_at)}
                      </p>
                      {showAgentDelivery ? (
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
                      {showAgentDelivery && delivery === 'failed' ? (
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
                  {isAgent || isInternalNote ? (
                    <div
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${messageAvatarClass(st)}`}
                    >
                      {messageSenderInitial(st)}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="mx-3 mb-3 mt-auto shrink-0 rounded-xl border border-[#2b3652] bg-[#1a2338] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex rounded-md border border-[#334060] p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setComposerMode('reply')}
                  className={`rounded px-2.5 py-1 ${
                    composerMode === 'reply'
                      ? 'bg-[#334680] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => setComposerMode('internal_note')}
                  className={`rounded px-2.5 py-1 ${
                    composerMode === 'internal_note'
                      ? 'bg-amber-900/50 text-amber-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Internal note
                </button>
              </div>
              {!isInternalNoteMode ? (
                <RestrictedControl
                  restricted={Boolean(composerAiDisabledReason) || sendingMessage}
                  reason={composerAiDisabledReason}
                >
                  <ComposerAiMenu
                    disabled={Boolean(composerAiDisabledReason) || sendingMessage}
                    disabledReason={composerAiDisabledReason}
                    onTranslate={(lang) => void runComposerTranslate(lang)}
                    onRewrite={(tone) => void runComposerRewrite(tone)}
                  />
                </RestrictedControl>
              ) : (
                <span className="text-[10px] text-amber-200/80">Team only — not sent to customer</span>
              )}
            </div>
            {pendingSuggestLineage?.runId && !isInternalNoteMode ? (
              <p className="mb-2 text-[10px] text-violet-300/90">
                AI-assisted draft — tracked when you send.
              </p>
            ) : null}
            <RestrictedControl
              restricted={
                isInternalNoteMode
                  ? inboxPerms.internalNote.restricted
                  : inboxPerms.reply.restricted
              }
              reason={
                isInternalNoteMode ? inboxPerms.internalNote.reason : inboxPerms.reply.reason
              }
              className="relative mb-3 block w-full"
            >
              <ComposerMentionMenu
                members={mentionMembersExcludingSelf}
                query={mentionQuery}
                open={isInternalNoteMode && mentionMenuOpen}
                highlightIndex={mentionHighlight}
                onSelect={handleMentionSelect}
              />
              <textarea
                ref={composerTextareaRef}
                value={draftMessage}
                onChange={(event) => {
                  const next = event.target.value
                  if (isInternalNoteMode) {
                    handleDraftChange(next)
                  } else {
                    setDraftMessage(next)
                    if (next.trim()) {
                      onComposerActivity()
                    } else {
                      stopTypingImmediately()
                      setPendingSuggestLineage(null)
                    }
                  }
                }}
                onKeyDown={onComposerKeyDown}
                onBlur={() => {
                  stopTypingImmediately()
                  closeMentionMenu()
                }}
                rows={3}
                placeholder={
                  !activeConversationId
                    ? 'Select a conversation first'
                    : isInternalNoteMode
                      ? inboxPerms.internalNote.restricted
                        ? 'Internal notes disabled for your role'
                        : 'Internal note — type @ to mention a teammate'
                      : inboxPerms.reply.restricted
                        ? 'Replies disabled for your role'
                        : 'Type a reply to the customer...'
                }
                className={`w-full resize-none rounded-md border px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#4f6290] ${
                  isInternalNoteMode
                    ? 'border-amber-500/35 bg-[#1f1a14]'
                    : 'border-[#334060] bg-[#0f1728]'
                }`}
                disabled={
                  !activeConversationId ||
                  sendingMessage ||
                  (isInternalNoteMode
                    ? inboxPerms.internalNote.restricted
                    : inboxPerms.reply.restricted)
                }
              />
            </RestrictedControl>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                {isInternalNoteMode
                  ? 'Enter to pick @mention · Ctrl/Cmd + Enter to post'
                  : 'Use Ctrl/Cmd + Enter to send'}
              </span>
              <RestrictedControl
                restricted={
                  !canSendMessage &&
                  Boolean(
                    isInternalNoteMode ? inboxPerms.internalNote.reason : inboxPerms.reply.reason,
                  )
                }
                reason={
                  isInternalNoteMode ? inboxPerms.internalNote.reason : inboxPerms.reply.reason
                }
                className="shrink-0"
              >
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!canSendMessage}
                  className={`rounded-md px-3 py-1 text-slate-100 disabled:cursor-not-allowed disabled:opacity-50 ${
                    isInternalNoteMode ? 'bg-amber-800/80' : 'bg-[#334680]'
                  }`}
                >
                  {sendingMessage
                    ? 'Sending...'
                    : isInternalNoteMode
                      ? 'Post note'
                      : 'Send'}
                </button>
              </RestrictedControl>
            </div>
          </div>
          <ComposerAiPreviewModal
            open={Boolean(aiPreview)}
            title={aiPreview?.title ?? 'AI preview'}
            original={aiPreview?.original ?? ''}
            proposed={aiPreview?.proposed ?? ''}
            loading={Boolean(aiPreview?.loading)}
            onCancel={() => setAiPreview(null)}
            onReplace={() => {
              if (!aiPreview?.proposed?.trim()) return
              applyComposerAiReplace(aiPreview.proposed, {
                runId: aiPreview.runId,
                sourceText: aiPreview.proposed,
              })
              setAiPreview(null)
            }}
          />
            </>
          )}
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#141b2d] text-sm">
          <div className="flex shrink-0 gap-4 border-b border-[#27314a] p-4">
            <button
              type="button"
              onClick={() => setSidebarTab('details')}
              className={`text-lg ${sidebarTab === 'details' ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('copilot')}
              className={`text-lg ${sidebarTab === 'copilot' ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Copilot
            </button>
          </div>
          <div className="inbox-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 text-slate-300 [scrollbar-gutter:stable]">
            {sidebarTab === 'copilot' ? (
              inboxPerms.aiCopilot.restricted ? (
                <p className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                  {inboxPerms.aiCopilot.reason}
                </p>
              ) : (
                <InboxCopilotPanel
                  organizationId={organizationId}
                  conversationId={activeConversationId}
                  conversationAiEnabled={selectedConversation?.ai_enabled}
                  conversationClassification={
                    selectedConversation?.metadata?.ai &&
                    typeof selectedConversation.metadata.ai === 'object'
                      ? selectedConversation.metadata.ai
                      : null
                  }
                  orgAi={orgAiSettings}
                  onInsertReply={handleCopilotInsertReply}
                />
              )
            ) : null}
            {sidebarTab === 'details' ? (
            <>
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0">Assignee</span>
                <span className="max-w-[160px] truncate text-right text-white" title={assigneeLabel}>
                  {assigneeLabel}
                </span>
              </div>
              {assignError ? (
                <p className="text-xs text-red-300" role="alert">
                  {assignError}
                </p>
              ) : null}
              <AssignmentAuditHint log={assignmentAudit} isAdmin={isOrgAdmin} orgId={organizationId} />
              <div ref={assignMenuRef} className="relative">
                <RestrictedControl
                  restricted={
                    !selectedConversation ||
                    assigningConversation ||
                    inboxPerms.assignMenu.restricted
                  }
                  reason={
                    !selectedConversation
                      ? 'Select a conversation first.'
                      : inboxPerms.assignMenu.reason
                  }
                  className="w-full"
                >
                  <button
                    type="button"
                    disabled={
                      !selectedConversation ||
                      assigningConversation ||
                      inboxPerms.assignMenu.restricted
                    }
                    aria-expanded={assignMenuOpen}
                    aria-haspopup="listbox"
                    aria-controls="inbox-assign-member-list"
                    onClick={() => setAssignMenuOpen((open) => !open)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#334060] bg-[#18233b] px-3 py-2 text-xs font-medium text-white hover:bg-[#1f2d4d] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Assign
                    <ChevronDown
                      size={14}
                      aria-hidden
                      className={`shrink-0 transition-transform ${assignMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                </RestrictedControl>
                {assignMenuOpen ? (
                  <div
                    id="inbox-assign-member-list"
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-md border border-[#2a3654] bg-[#10182a] py-1 shadow-lg [scrollbar-gutter:stable]"
                  >
                    {!organizationId ? (
                      <p className="px-3 py-2 text-xs text-slate-500">No organization context.</p>
                    ) : (
                      <>
                        <RestrictedControl
                          restricted={
                            !selectedConversation ||
                            assigningConversation ||
                            inboxPerms.unassign.restricted
                          }
                          reason={inboxPerms.unassign.reason}
                          className="w-full"
                        >
                          <button
                            type="button"
                            role="option"
                            disabled={
                              !selectedConversation ||
                              assigningConversation ||
                              inboxPerms.unassign.restricted
                            }
                            onClick={() => {
                              if (!selectedConversation || inboxPerms.unassign.restricted) return
                              setAssignMenuOpen(false)
                              void assignConversation(selectedConversation.id, null)
                            }}
                            className="flex w-full flex-col items-start gap-0.5 border-b border-[#2a3654] px-3 py-2 text-left text-xs hover:bg-[#1a2540] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="font-medium text-amber-100/90">Unassign</span>
                            <span className="text-[11px] text-slate-500">Clear assignee</span>
                          </button>
                        </RestrictedControl>
                        {sortedOrgMembersForAssign.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-slate-500">No members loaded.</p>
                        ) : (
                          sortedOrgMembersForAssign.map((member) => {
                            const isCurrent = member.id === selectedConversation?.assigned_to_member_id
                            const isYou = member.userId === user?.id
                            const memberGate = inboxPerms.assignMember(member.id)
                            return (
                              <RestrictedControl
                                key={member.id}
                                restricted={
                                  assigningConversation ||
                                  isCurrent ||
                                  !selectedConversation ||
                                  memberGate.restricted
                                }
                                reason={
                                  isCurrent
                                    ? 'Already assigned to this agent.'
                                    : memberGate.reason
                                }
                                className="w-full"
                              >
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={isCurrent}
                                  disabled={
                                    assigningConversation ||
                                    isCurrent ||
                                    !selectedConversation ||
                                    memberGate.restricted
                                  }
                                  onClick={() => {
                                    if (
                                      !selectedConversation ||
                                      isCurrent ||
                                      memberGate.restricted
                                    ) {
                                      return
                                    }
                                    setAssignMenuOpen(false)
                                    void assignConversation(selectedConversation.id, member.id)
                                  }}
                                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-[#1a2540] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <span className="font-medium text-white">
                                    {member.displayName}
                                    {isYou ? (
                                      <span className="ml-1 font-normal text-slate-400">(you)</span>
                                    ) : null}
                                    {isCurrent ? (
                                      <span className="ml-1 font-normal text-emerald-400/90">
                                        · current
                                      </span>
                                    ) : null}
                                  </span>
                                  {member.email ? (
                                    <span className="truncate text-[11px] text-slate-500">
                                      {member.email}
                                    </span>
                                  ) : null}
                                </button>
                              </RestrictedControl>
                            )
                          })
                        )}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-[#27314a] pt-3">
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0">Team inbox</span>
                <span className="max-w-[160px] truncate text-right text-white" title={teamInboxLabel}>
                  {teamInboxLabel}
                </span>
              </div>
              <div ref={teamInboxAssignMenuRef} className="relative">
                <RestrictedControl
                  restricted={
                    !selectedConversation ||
                    assigningConversation ||
                    inboxPerms.assignMenu.restricted
                  }
                  reason={
                    !selectedConversation
                      ? 'Select a conversation first.'
                      : inboxPerms.assignMenu.reason
                  }
                  className="w-full"
                >
                  <button
                    type="button"
                    disabled={
                      !selectedConversation ||
                      assigningConversation ||
                      inboxPerms.assignMenu.restricted ||
                      (loadingInboxes && sortedOrgInboxesForAssign.length === 0)
                    }
                    aria-expanded={teamInboxAssignMenuOpen}
                    aria-haspopup="listbox"
                    aria-controls="inbox-assign-team-inbox-list"
                    onClick={() => setTeamInboxAssignMenuOpen((open) => !open)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#334060] bg-[#18233b] px-3 py-2 text-xs font-medium text-white hover:bg-[#1f2d4d] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Assign team inbox
                    <ChevronDown
                      size={14}
                      aria-hidden
                      className={`shrink-0 transition-transform ${teamInboxAssignMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                </RestrictedControl>
                {teamInboxAssignMenuOpen ? (
                  <div
                    id="inbox-assign-team-inbox-list"
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-md border border-[#2a3654] bg-[#10182a] py-1 shadow-lg [scrollbar-gutter:stable]"
                  >
                    {!organizationId ? (
                      <p className="px-3 py-2 text-xs text-slate-500">No organization context.</p>
                    ) : (
                      <>
                        <RestrictedControl
                          restricted={
                            !selectedConversation ||
                            assigningConversation ||
                            inboxPerms.assignMenu.restricted
                          }
                          reason={inboxPerms.assignMenu.reason}
                          className="w-full"
                        >
                          <button
                            type="button"
                            role="option"
                            disabled={
                              !selectedConversation ||
                              assigningConversation ||
                              inboxPerms.assignMenu.restricted
                            }
                            onClick={() => {
                              if (!selectedConversation || inboxPerms.assignMenu.restricted) return
                              setTeamInboxAssignMenuOpen(false)
                              void assignTeamInbox(selectedConversation.id, null)
                            }}
                            className="flex w-full flex-col items-start gap-0.5 border-b border-[#2a3654] px-3 py-2 text-left text-xs hover:bg-[#1a2540] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="font-medium text-amber-100/90">Clear team inbox</span>
                            <span className="text-[11px] text-slate-500">Remove from team queue</span>
                          </button>
                        </RestrictedControl>
                        {sortedOrgInboxesForAssign.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-slate-500">
                            {loadingInboxes ? 'Loading team inboxes…' : 'No team inboxes. Create one in Settings.'}
                          </p>
                        ) : (
                          sortedOrgInboxesForAssign.map((inbox) => {
                            const isCurrent = inbox.id === selectedConversation?.team_inbox_id
                            return (
                              <RestrictedControl
                                key={inbox.id}
                                restricted={
                                  assigningConversation ||
                                  isCurrent ||
                                  !selectedConversation ||
                                  inboxPerms.assignMenu.restricted
                                }
                                reason={
                                  isCurrent
                                    ? 'Already assigned to this team inbox.'
                                    : inboxPerms.assignMenu.reason
                                }
                                className="w-full"
                              >
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={isCurrent}
                                  disabled={
                                    assigningConversation ||
                                    isCurrent ||
                                    !selectedConversation ||
                                    inboxPerms.assignMenu.restricted
                                  }
                                  onClick={() => {
                                    if (
                                      !selectedConversation ||
                                      isCurrent ||
                                      inboxPerms.assignMenu.restricted
                                    ) {
                                      return
                                    }
                                    setTeamInboxAssignMenuOpen(false)
                                    void assignTeamInbox(selectedConversation.id, inbox.id)
                                  }}
                                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-[#1a2540] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <span className="font-medium text-white">
                                    {inbox.name}
                                    {isCurrent ? (
                                      <span className="ml-1 font-normal text-emerald-400/90">
                                        · current
                                      </span>
                                    ) : null}
                                  </span>
                                </button>
                              </RestrictedControl>
                            )
                          })
                        )}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <ConversationTagsPanel
              organizationId={organizationId}
              conversationId={activeConversationId}
              onUpdated={(conv) => {
                if (conv) upsertConversation(conv)
              }}
            />
            <div className="flex flex-col gap-2 border-t border-[#27314a] pt-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lifecycle</span>
              {suggestWaitingOnCustomer ? (
                <p className="rounded-md border border-sky-900/50 bg-sky-950/30 px-2 py-1.5 text-[11px] text-sky-100">
                  You sent the last reply — resolve or close when done (waiting on customer is set automatically).
                </p>
              ) : null}
              {lifecycleDetailHint ? (
                <p className="rounded-md border border-emerald-900/40 bg-emerald-950/25 px-2 py-1.5 text-[11px] text-emerald-100">
                  {lifecycleDetailHint}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <RestrictedControl
                  restricted={!selectedConversation || conversationDetailSaving}
                  reason={!selectedConversation ? 'Select a conversation first.' : null}
                  className="flex flex-1"
                >
                  <button
                    type="button"
                    disabled={!selectedConversation || conversationDetailSaving}
                    onClick={() => void patchConversationDetails({ status: 'resolved' })}
                    className="inline-flex w-full flex-1 items-center justify-center gap-1.5 rounded-md border border-emerald-900/50 bg-emerald-950/40 px-2 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-950/60 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CheckCircle2 size={14} aria-hidden />
                    Resolve
                  </button>
                </RestrictedControl>
                <RestrictedControl
                  restricted={
                    !selectedConversation || conversationDetailSaving || inboxPerms.close.restricted
                  }
                  reason={
                    !selectedConversation
                      ? 'Select a conversation first.'
                      : inboxPerms.close.reason
                  }
                  className="flex flex-1"
                >
                  <button
                    type="button"
                    disabled={
                      !selectedConversation ||
                      conversationDetailSaving ||
                      inboxPerms.close.restricted
                    }
                    onClick={() => void patchConversationDetails({ status: 'closed' })}
                    className="inline-flex w-full flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-600/60 bg-slate-900/50 px-2 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Archive size={14} aria-hidden />
                    Close
                  </button>
                </RestrictedControl>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Workspace</span>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Status
                <select
                  value={selectedConversation?.status ?? 'open'}
                  disabled={!selectedConversation || conversationDetailSaving}
                  onChange={(e) => void patchConversationDetails({ status: e.target.value })}
                  className="rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1.5 text-sm text-white outline-none focus:border-[#4f6290] disabled:opacity-40"
                >
                  {CONVERSATION_WORKSPACE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                  <option value="resolved">resolved</option>
                  <option value="closed">closed</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Priority
                <select
                  value={selectedConversation?.priority ?? 'medium'}
                  disabled={!selectedConversation || conversationDetailSaving}
                  onChange={(e) => void patchConversationDetails({ priority: e.target.value })}
                  className="rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1.5 text-sm text-white outline-none focus:border-[#4f6290] disabled:opacity-40"
                >
                  {CONVERSATION_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Assignment queue
                <select
                  value={selectedConversation?.assignment_type ?? 'unassigned'}
                  disabled={!selectedConversation || conversationDetailSaving}
                  onChange={(e) => {
                    const next = e.target.value
                    if (next === 'assigned_to_ai' || next === 'unassigned') {
                      void patchConversationDetails({ assignmentType: next, assignedToMemberId: null })
                      return
                    }
                    if (next === 'assigned_to_team') {
                      const tid = selectedConversation?.team_inbox_id
                      if (tid) {
                        void patchConversationDetails({
                          assignmentType: 'assigned_to_team',
                          teamInboxId: tid,
                        })
                      }
                      return
                    }
                    if (next === 'assigned_to_agent') {
                      const mid = selectedConversation?.assigned_to_member_id ?? myMembership?.id
                      if (mid) void patchConversationDetails({ assignmentType: 'assigned_to_agent', assignedToMemberId: mid })
                    }
                  }}
                  className="rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1.5 text-sm text-white outline-none focus:border-[#4f6290] disabled:opacity-40"
                >
                  {CONVERSATION_ASSIGNMENT_TYPES.map((a) => (
                    <option key={a} value={a}>
                      {a.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              {conversationDetailSaving ? (
                <p className="text-[11px] text-slate-500">Saving…</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 border-t border-[#27314a] pt-3">
              <span className="text-xs text-slate-400">Spam (quick)</span>
              {selectedConversation?.is_spam === true || selectedConversation?.status === 'spam' ? (
                <RestrictedControl
                  restricted={
                    !selectedConversation || spamUpdating || inboxPerms.spam.restricted
                  }
                  reason={
                    !selectedConversation
                      ? 'Select a conversation first.'
                      : inboxPerms.spam.reason
                  }
                  className="w-full"
                >
                  <button
                    type="button"
                    disabled={
                      !selectedConversation || spamUpdating || inboxPerms.spam.restricted
                    }
                    onClick={() =>
                      selectedConversation &&
                      !inboxPerms.spam.restricted &&
                      applySpamFlag(selectedConversation.id, false)
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-950/60 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ShieldAlert size={14} aria-hidden />
                    Remove from spam
                  </button>
                </RestrictedControl>
              ) : (
                <RestrictedControl
                  restricted={
                    !selectedConversation || spamUpdating || inboxPerms.spam.restricted
                  }
                  reason={
                    !selectedConversation
                      ? 'Select a conversation first.'
                      : inboxPerms.spam.reason
                  }
                  className="w-full"
                >
                  <button
                    type="button"
                    disabled={
                      !selectedConversation || spamUpdating || inboxPerms.spam.restricted
                    }
                    onClick={() =>
                      selectedConversation &&
                      !inboxPerms.spam.restricted &&
                      applySpamFlag(selectedConversation.id, true)
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ShieldAlert size={14} aria-hidden />
                    Mark as spam
                  </button>
                </RestrictedControl>
              )}
            </div>
            <div className="pt-2 text-xs text-slate-400">Links</div>
            <div className="flex items-center gap-2"><Link2 size={14} /> Tracker ticket</div>
            <div className="flex items-center gap-2"><ShieldAlert size={14} /> Back-office tickets</div>
            <div className="pt-2 text-xs text-slate-400">Conversation attributes</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span>Source</span><span className="text-white">{selectedConversation?.source ?? '-'}</span>
              <span>Assignment</span>
              <span className="text-white">
                {(selectedConversation?.assignment_type ?? 'unassigned').replace(/_/g, ' ')}
              </span>
              <span>Team inbox</span>
              <span className="truncate text-white" title={teamInboxLabel}>
                {teamInboxLabel}
              </span>
              <span>ID</span><span className="text-white">{selectedConversation ? `${selectedConversation.id.slice(0, 8)}...` : '-'}</span>
            </div>
            <div className="pt-2 text-xs text-slate-400">User data</div>
            <div className="flex items-center gap-2"><CircleUserRound size={14} /> Customer: {selectedConversation?.customer_id ? `${selectedConversation.customer_id.slice(0, 8)}...` : 'N/A'}</div>
            <div className="flex items-center gap-2"><Users size={14} /> Team insights</div>
            <div className="flex items-center gap-2"><Bell size={14} /> Alerts</div>
            <div className="flex items-center gap-2"><Clock3 size={14} /> Last updated {getRelativeTimeLabel(selectedConversation?.last_message_at)}</div>
            <div className="flex items-center gap-2"><Phone size={14} /> Voice available</div>
            </>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  )
}
