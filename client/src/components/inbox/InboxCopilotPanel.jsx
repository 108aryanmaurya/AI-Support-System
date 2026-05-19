import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Loader2, Sparkles } from 'lucide-react'
import {
  SUGGEST_REPLY_LENGTHS,
  SUGGEST_REPLY_TONES,
  SUMMARY_TYPES,
} from '@ai-support/shared'
import { getAiHealth, suggestReply, summarize } from '../../services/aiApi.js'

function confidenceLabel(value) {
  if (value == null || !Number.isFinite(Number(value))) return null
  return `${Math.round(Number(value) * 100)}%`
}

function SummaryView({ summary, type }) {
  if (!summary || typeof summary !== 'object') return null

  if (type === 'timeline' && Array.isArray(summary.events)) {
    return (
      <ul className="list-disc space-y-2 pl-4 text-sm text-slate-200">
        {summary.events.map((ev, i) => (
          <li key={`ev-${i}`}>
            <span className="text-xs text-slate-400">{ev.when || '—'}</span>
            <p className="mt-0.5">{ev.what}</p>
          </li>
        ))}
      </ul>
    )
  }

  const issue = summary.issue
  const status = summary.current_status ?? summary.currentStatus
  const actions = summary.actions_taken ?? summary.actionsTaken

  return (
    <div className="space-y-3 text-sm text-slate-200">
      {issue ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Issue</p>
          <p className="mt-1 whitespace-pre-wrap">{issue}</p>
        </div>
      ) : null}
      {Array.isArray(actions) && actions.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Actions taken</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {actions.map((item, i) => (
              <li key={`act-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {status ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
          <p className="mt-1 whitespace-pre-wrap">{status}</p>
        </div>
      ) : null}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-2 border-t border-[#27314a] pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Read-only AI classification from conversations.metadata.ai (async worker).
 * @param {{ intent?: string, sentiment?: string, sentiment_score?: number, language?: string, auto_tags?: string[] } | null | undefined} data
 */
function ClassificationSignals({ data }) {
  if (!data || typeof data !== 'object') return null

  const intent = typeof data.intent === 'string' ? data.intent : null
  const sentiment = typeof data.sentiment === 'string' ? data.sentiment : null
  const language = typeof data.language === 'string' ? data.language : null
  const score =
    data.sentiment_score != null && Number.isFinite(Number(data.sentiment_score))
      ? Number(data.sentiment_score)
      : null
  const autoTags = Array.isArray(data.auto_tags)
    ? data.auto_tags.filter((t) => typeof t === 'string' && t.trim())
    : []

  if (!intent && !sentiment && !language && autoTags.length === 0) return null

  return (
    <div className="rounded-lg border border-[#334060] bg-[#0f1728] p-3 text-xs text-slate-300">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Thread signals (AI)
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {intent ? (
          <>
            <dt className="text-slate-500">Intent</dt>
            <dd className="capitalize text-slate-200">{intent.replace(/_/g, ' ')}</dd>
          </>
        ) : null}
        {sentiment ? (
          <>
            <dt className="text-slate-500">Sentiment</dt>
            <dd className="capitalize text-slate-200">
              {sentiment}
              {score != null ? ` (${Math.round(score * 100)}%)` : ''}
            </dd>
          </>
        ) : null}
        {language ? (
          <>
            <dt className="text-slate-500">Language</dt>
            <dd className="uppercase text-slate-200">{language}</dd>
          </>
        ) : null}
      </dl>
      {autoTags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {autoTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-200"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * @param {object} props
 * @param {string} props.organizationId
 * @param {string | null} props.conversationId
 * @param {boolean | undefined} props.conversationAiEnabled
 * @param {{ ai_enabled?: boolean, assist_enabled?: boolean } | null} props.orgAi
 * @param {object | null | undefined} [props.conversationClassification]
 * @param {(text: string, meta?: { runId?: string | null; sourceText?: string }) => void} props.onInsertReply
 */
export function InboxCopilotPanel({
  organizationId,
  conversationId,
  conversationAiEnabled,
  orgAi,
  conversationClassification,
  onInsertReply,
}) {
  const [llmConfigured, setLlmConfigured] = useState(null)
  const [llmProviderLabel, setLlmProviderLabel] = useState(null)
  const [llmModel, setLlmModel] = useState(null)
  const [healthError, setHealthError] = useState('')

  const [tone, setTone] = useState('professional')
  const [length, setLength] = useState('medium')
  const [summaryType, setSummaryType] = useState('detailed')

  const [suggestLoading, setSuggestLoading] = useState(false)
  const [summarizeLoading, setSummarizeLoading] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const [summarizeError, setSummarizeError] = useState('')

  const [lastSuggest, setLastSuggest] = useState(null)
  const [lastSummary, setLastSummary] = useState(null)

  const loadHealth = useCallback(async () => {
    if (!organizationId) return
    setHealthError('')
    try {
      const res = await getAiHealth(organizationId)
      setLlmConfigured(Boolean(res?.llmConfigured))
      setLlmProviderLabel(res?.llmProviderLabel ?? res?.llmProvider ?? null)
      setLlmModel(res?.llmModel ?? null)
    } catch (e) {
      setLlmConfigured(false)
      setHealthError(e.message || 'Could not check AI health.')
    }
  }, [organizationId])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  useEffect(() => {
    setSuggestError('')
    setSummarizeError('')
    setLastSuggest(null)
    setLastSummary(null)
  }, [conversationId])

  const disabledReason = useMemo(() => {
    if (!organizationId) return 'No organization selected.'
    if (!conversationId) return 'Select a conversation to use Copilot.'
    if (orgAi && orgAi.ai_enabled === false) return 'AI is disabled for this organization.'
    if (orgAi && orgAi.assist_enabled === false) return 'AI assist is turned off in organization settings.'
    if (conversationAiEnabled === false) return 'AI is disabled for this conversation.'
    if (llmConfigured === false) return 'AI provider is not configured on the server (LLM_API_KEY).'
    return null
  }, [organizationId, conversationId, orgAi, conversationAiEnabled, llmConfigured])

  const actionsDisabled = Boolean(disabledReason) || suggestLoading || summarizeLoading

  async function handleSuggestReply() {
    if (!organizationId || !conversationId || actionsDisabled) return
    setSuggestLoading(true)
    setSuggestError('')
    try {
      const res = await suggestReply(organizationId, {
        conversationId,
        tone,
        length,
        useKnowledge: true,
      })
      const reply = res.reply ?? res.suggestion ?? ''
      if (!reply.trim()) {
        setSuggestError('AI returned an empty suggestion.')
        return
      }
      setLastSuggest({
        reply,
        confidence: res.confidence ?? null,
        runId: res.runId ?? null,
        model: res.model ?? null,
      })
      onInsertReply(reply, { runId: res.runId ?? null, sourceText: reply })
    } catch (e) {
      const retrySec = e?.body?.retryAfterSeconds
      const base = e.message || 'Failed to suggest a reply.'
      setSuggestError(
        retrySec != null && Number.isFinite(Number(retrySec))
          ? `${base} Try again in about ${Math.ceil(Number(retrySec))}s.`
          : base,
      )
    } finally {
      setSuggestLoading(false)
    }
  }

  async function handleSummarize() {
    if (!organizationId || !conversationId || actionsDisabled) return
    setSummarizeLoading(true)
    setSummarizeError('')
    try {
      const res = await summarize(organizationId, {
        conversationId,
        type: summaryType,
      })
      setLastSummary({
        summary: res.summary,
        type: res.type ?? summaryType,
        runId: res.runId ?? null,
        model: res.model ?? null,
      })
    } catch (e) {
      const retrySec = e?.body?.retryAfterSeconds
      const base = e.message || 'Failed to summarize the thread.'
      setSummarizeError(
        retrySec != null && Number.isFinite(Number(retrySec))
          ? `${base} Try again in about ${Math.ceil(Number(retrySec))}s.`
          : base,
      )
    } finally {
      setSummarizeLoading(false)
    }
  }

  if (!organizationId) {
    return <p className="text-xs text-slate-500">Open an organization workspace to use Copilot.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-slate-200">
        <Bot size={18} className="text-violet-300" aria-hidden />
        <span className="text-sm font-semibold">Inbox Copilot</span>
        {llmProviderLabel ? (
          <span className="text-[10px] text-slate-500" title={llmModel ?? undefined}>
            {llmProviderLabel}
            {llmModel ? ` · ${llmModel}` : ''}
          </span>
        ) : null}
        {llmConfigured === true ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            Ready
          </span>
        ) : llmConfigured === false ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
            Unconfigured
          </span>
        ) : null}
      </div>

      {healthError ? <p className="text-xs text-amber-200/90">{healthError}</p> : null}

      {disabledReason ? (
        <p className="rounded-lg border border-[#334060] bg-[#0f1728] px-3 py-2 text-xs text-slate-400">
          {disabledReason}
        </p>
      ) : null}

      <ClassificationSignals data={conversationClassification} />

      <Section title="Suggest reply">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">
            Tone
            <select
              value={tone}
              disabled={actionsDisabled}
              onChange={(e) => setTone(e.target.value)}
              className="rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1.5 text-xs text-white outline-none focus:border-[#4f6290] disabled:opacity-40"
            >
              {SUGGEST_REPLY_TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">
            Length
            <select
              value={length}
              disabled={actionsDisabled}
              onChange={(e) => setLength(e.target.value)}
              className="rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1.5 text-xs text-white outline-none focus:border-[#4f6290] disabled:opacity-40"
            >
              {SUGGEST_REPLY_LENGTHS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={actionsDisabled}
          onClick={() => void handleSuggestReply()}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-violet-500/40 bg-violet-950/40 px-3 py-2 text-xs font-medium text-violet-100 hover:bg-violet-950/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {suggestLoading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
          {suggestLoading ? 'Suggesting…' : 'Suggest reply'}
        </button>
        <p className="text-[11px] text-slate-500">Inserts a draft into the composer — review before sending.</p>
        {suggestError ? <p className="text-xs text-red-300">{suggestError}</p> : null}
        {lastSuggest ? (
          <div className="rounded-lg border border-[#334060] bg-[#0f1728] p-3 text-xs text-slate-300">
            <div className="flex flex-wrap items-center gap-2">
              {confidenceLabel(lastSuggest.confidence) ? (
                <span className="rounded-full bg-violet-500/20 px-2 py-0.5 font-medium text-violet-200">
                  {confidenceLabel(lastSuggest.confidence)} confidence
                </span>
              ) : null}
              {lastSuggest.runId ? (
                <span className="font-mono text-[10px] text-slate-500" title={lastSuggest.runId}>
                  run {lastSuggest.runId.slice(0, 8)}…
                </span>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-slate-200">{lastSuggest.reply}</p>
            <button
              type="button"
              className="mt-2 text-[11px] font-medium text-sky-300 hover:text-sky-200"
              onClick={() =>
                onInsertReply(lastSuggest.reply, {
                  runId: lastSuggest.runId,
                  sourceText: lastSuggest.reply,
                })
              }
            >
              Insert again
            </button>
          </div>
        ) : null}
      </Section>

      <Section title="Summarize thread">
        <label className="flex flex-col gap-1 text-[11px] text-slate-400">
          Format
          <select
            value={summaryType}
            disabled={actionsDisabled}
            onChange={(e) => setSummaryType(e.target.value)}
            className="rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1.5 text-xs text-white outline-none focus:border-[#4f6290] disabled:opacity-40"
          >
            {SUMMARY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={actionsDisabled}
          onClick={() => void handleSummarize()}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#334060] bg-[#18233b] px-3 py-2 text-xs font-medium text-white hover:bg-[#1f2d4d] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {summarizeLoading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
          {summarizeLoading ? 'Summarizing…' : 'Summarize thread'}
        </button>
        {summarizeError ? <p className="text-xs text-red-300">{summarizeError}</p> : null}
        {lastSummary?.summary ? (
          <div className="rounded-lg border border-[#334060] bg-[#0f1728] p-3">
            {lastSummary.runId ? (
              <p className="mb-2 font-mono text-[10px] text-slate-500" title={lastSummary.runId}>
                run {lastSummary.runId.slice(0, 8)}…
              </p>
            ) : null}
            <SummaryView summary={lastSummary.summary} type={lastSummary.type} />
          </div>
        ) : null}
      </Section>
    </div>
  )
}
