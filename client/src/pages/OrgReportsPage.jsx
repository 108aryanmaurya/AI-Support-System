import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AiRunsTable } from '../components/reports/AiRunsTable.jsx'
import { ReportsBreakdownBars } from '../components/reports/ReportsBreakdownBars.jsx'
import { ReportsKpiGrid } from '../components/reports/ReportsKpiGrid.jsx'
import { ReportsLineChart } from '../components/reports/ReportsLineChart.jsx'
import {
  defaultReportRange,
  fetchAnalyticsAi,
  fetchAnalyticsConversations,
  fetchAnalyticsKnowledge,
  fetchAnalyticsOverview,
  fetchAnalyticsTeam,
} from '../services/analyticsApi.js'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'team', label: 'Team' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'ai', label: 'AI' },
]

function AiTabPanel({ data, loading, error, organizationId, range }) {
  if (loading) return <p className="text-sm text-slate-400">Loading AI metrics…</p>
  if (error) return <p className="text-sm text-rose-400">{error}</p>
  if (!data) return null

  if (data.available === false) {
    return (
      <div className="rounded-xl border border-[#1d253a] bg-[#151b2e] p-6 text-sm text-slate-300">
        {data.message ||
          'AI metrics appear after AI assist is configured. Enable AI in Settings → AI & Automation.'}
      </div>
    )
  }

  const kpis = [
    {
      id: 'ai_runs',
      label: 'AI assist runs',
      value: data.totalRuns ?? 0,
      deltaPercent: data.totalRunsDelta ?? 0,
      unit: 'count',
    },
    {
      id: 'ai_tokens',
      label: 'Tokens (in + out)',
      value: (data.tokensInput ?? 0) + (data.tokensOutput ?? 0),
      deltaPercent: 0,
      unit: 'count',
    },
    {
      id: 'ai_assigned',
      label: 'AI-assigned conversations',
      value: data.aiAssignedConversations ?? data.productContext?.aiAssignedConversations ?? 0,
      deltaPercent: 0,
      unit: 'count',
    },
    {
      id: 'ai_outbound',
      label: 'AI messages sent',
      value: data.productContext?.outboundAiMessages ?? 0,
      deltaPercent: 0,
      unit: 'count',
    },
    {
      id: 'ai_latency',
      label: 'Latency p50 (ms)',
      value: data.latencyMsP50 ?? '—',
      deltaPercent: 0,
      unit: 'count',
    },
    {
      id: 'ai_feedback',
      label: 'Agent feedback',
      value: data.feedbackCount ?? 0,
      deltaPercent: 0,
      unit: 'count',
    },
    {
      id: 'ai_acceptance',
      label: 'Suggestion acceptance',
      value: data.acceptanceRate != null ? `${data.acceptanceRate}%` : '—',
      deltaPercent: data.acceptanceRateDelta ?? 0,
      unit: 'percent',
    },
    {
      id: 'ai_failed',
      label: 'Failed runs',
      value: data.failedRuns ?? 0,
      deltaPercent: 0,
      unit: 'count',
    },
  ]

  return (
    <div className="space-y-6">
      {data.message && (data.totalRuns ?? 0) === 0 ? (
        <p className="text-sm text-slate-400">{data.message}</p>
      ) : null}
      <ReportsKpiGrid kpis={kpis} />
      <ReportsBreakdownBars
        title="Runs by feature"
        items={(data.byFeature ?? []).map((f) => ({ key: f.feature, count: f.runCount }))}
      />
      {data.latencyMsP95 != null ? (
        <p className="text-xs text-slate-500">Latency p95: {data.latencyMsP95} ms</p>
      ) : null}
      {(data.feedbackAccepted != null || data.feedbackEdited != null) && (
        <p className="text-xs text-slate-500">
          Feedback: {data.feedbackAccepted ?? 0} accepted, {data.feedbackEdited ?? 0} edited
          {data.feedbackRejected != null ? `, ${data.feedbackRejected} rejected` : ''}
        </p>
      )}
      {organizationId ? <AiRunsTable organizationId={organizationId} range={range} /> : null}
    </div>
  )
}

export default function OrgReportsPage() {
  const { orgId } = useParams()
  const [tab, setTab] = useState('overview')
  const [range, setRange] = useState(defaultReportRange)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [overview, setOverview] = useState(null)
  const [conversations, setConversations] = useState(null)
  const [team, setTeam] = useState(null)
  const [ai, setAi] = useState(null)
  const [knowledge, setKnowledge] = useState(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const [ov, conv, tm, kb, aiData] = await Promise.all([
        fetchAnalyticsOverview(orgId, range),
        fetchAnalyticsConversations(orgId, range),
        fetchAnalyticsTeam(orgId, range),
        fetchAnalyticsKnowledge(orgId, range),
        fetchAnalyticsAi(orgId, range),
      ])
      setOverview(ov)
      setConversations(conv)
      setTeam(tm)
      setKnowledge(kb)
      setAi(aiData)
    } catch (e) {
      setError(e.message || 'Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }, [orgId, range])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0b1020] text-slate-100">
      <header className="shrink-0 border-b border-[#1d253a] px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Reports</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Product and AI performance for your workspace
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              From
              <input
                type="date"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className="rounded-lg border border-[#2b3858] bg-[#151b2e] px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              To
              <input
                type="date"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className="rounded-lg border border-[#2b3858] bg-[#151b2e] px-2 py-1.5 text-sm text-white"
              />
            </label>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-lg bg-[#3b82f6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="Report sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-[#151b2e] text-white'
                  : 'text-slate-400 hover:bg-[#111827] hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        {error ? (
          <p className="mb-4 rounded-lg border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        {tab === 'overview' && (
          <div className="space-y-6">
            <ReportsKpiGrid kpis={overview?.kpis} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ReportsLineChart
                title="New conversations"
                series={overview?.series?.conversations_created}
              />
              <ReportsLineChart
                title="Customer messages"
                series={overview?.series?.inbound_messages}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <ReportsBreakdownBars title="By channel" items={overview?.breakdowns?.channel} />
              <ReportsBreakdownBars title="By status" items={overview?.breakdowns?.status} />
              <ReportsBreakdownBars
                title="By assignment"
                items={overview?.breakdowns?.assignment}
              />
            </div>
            {overview?.ai?.summary ? (
              <section className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-4">
                <h3 className="text-sm font-semibold text-violet-200">AI snapshot</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {overview.ai.message || 'AI assist activity in this period.'}
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {overview.ai.summary.totalRuns ?? 0}{' '}
                  <span className="text-sm font-normal text-slate-400">runs</span>
                </p>
              </section>
            ) : null}
            {overview?.assignment ? (
              <section className="rounded-xl border border-cyan-900/30 bg-cyan-950/15 p-4">
                <h3 className="text-sm font-semibold text-cyan-200">Intelligent assignment (7d)</h3>
                <div className="mt-2 flex flex-wrap gap-6 text-sm text-slate-300">
                  <span>
                    Queue depth:{' '}
                    <strong className="text-white">
                      {overview.assignment.queueDepth ?? '—'}
                    </strong>
                  </span>
                  <span>
                    Auto-assigned:{' '}
                    <strong className="text-white">{overview.assignment.autoApplied ?? 0}</strong>
                  </span>
                  <span>
                    Fallback %:{' '}
                    <strong className="text-white">
                      {overview.assignment.fallbackPct != null
                        ? `${overview.assignment.fallbackPct}%`
                        : '—'}
                    </strong>
                  </span>
                  <span>
                    Reassign rate:{' '}
                    <strong className="text-white">
                      {overview.assignment.reassignRatePct != null
                        ? `${overview.assignment.reassignRatePct}%`
                        : '—'}
                    </strong>
                  </span>
                  <span>
                    Latency p50:{' '}
                    <strong className="text-white">
                      {overview.assignment.latencyP50Ms != null
                        ? `${overview.assignment.latencyP50Ms} ms`
                        : '—'}
                    </strong>
                  </span>
                  <span>
                    Load fairness σ:{' '}
                    <strong className="text-white">
                      {overview.assignment.fairnessStdDev ?? '—'}
                    </strong>
                  </span>
                </div>
                {overview.assignment.settingsPath ? (
                  <Link
                    to={overview.assignment.settingsPath}
                    className="mt-2 inline-block text-xs text-[#3ECF8E] hover:underline"
                  >
                    Assignment settings →
                  </Link>
                ) : null}
              </section>
            ) : null}
            {overview?.workflow ? (
              <section className="rounded-xl border border-emerald-900/30 bg-emerald-950/15 p-4">
                <h3 className="text-sm font-semibold text-emerald-200">Workflow automation (7d)</h3>
                <div className="mt-2 flex flex-wrap gap-6 text-sm text-slate-300">
                  <span>
                    Queue depth:{' '}
                    <strong className="text-white">{overview.workflow.queueDepth ?? '—'}</strong>
                  </span>
                  <span>
                    Actions applied:{' '}
                    <strong className="text-white">{overview.workflow.actionsApplied ?? '—'}</strong>
                  </span>
                  <span>
                    Rules enabled:{' '}
                    <strong className="text-white">{overview.workflow.rulesEnabled ?? 0}</strong>
                  </span>
                </div>
                {overview.workflow.settingsPath ? (
                  <Link
                    to={overview.workflow.settingsPath}
                    className="mt-2 inline-block text-xs text-[#3ECF8E] hover:underline"
                  >
                    Manage workflow rules →
                  </Link>
                ) : null}
              </section>
            ) : null}
          </div>
        )}

        {tab === 'conversations' && (
          <div className="space-y-6">
            <ReportsKpiGrid
              kpis={[
                {
                  id: 'new',
                  label: 'New conversations',
                  value: conversations?.totals?.newConversations ?? 0,
                  deltaPercent: conversations?.totals?.newConversationsDelta ?? 0,
                },
                {
                  id: 'inbound',
                  label: 'Customer messages',
                  value: conversations?.totals?.inboundMessages ?? 0,
                  deltaPercent: conversations?.totals?.inboundMessagesDelta ?? 0,
                },
                {
                  id: 'outbound',
                  label: 'Team replies',
                  value: conversations?.totals?.outboundAgentMessages ?? 0,
                  deltaPercent: 0,
                },
                {
                  id: 'ai_msgs',
                  label: 'AI messages',
                  value: conversations?.totals?.outboundAiMessages ?? 0,
                  deltaPercent: 0,
                },
              ]}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <ReportsLineChart
                title="New conversations"
                series={conversations?.series?.conversations_created}
              />
              <ReportsLineChart
                title="Inbound messages"
                series={conversations?.series?.inbound_messages}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <ReportsBreakdownBars
                title="By channel"
                items={conversations?.breakdowns?.channel}
              />
              <ReportsBreakdownBars title="By status" items={conversations?.breakdowns?.status} />
              <ReportsBreakdownBars
                title="By assignment"
                items={conversations?.breakdowns?.assignment}
              />
            </div>
          </div>
        )}

        {tab === 'team' && (
          <section className="rounded-xl border border-[#1d253a] bg-[#151b2e] overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#1d253a] bg-[#0f1424] text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium text-right">Replies sent</th>
                </tr>
              </thead>
              <tbody>
                {(team?.members ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                      No outbound activity in this period.
                    </td>
                  </tr>
                ) : (
                  team.members.map((m) => (
                    <tr key={m.memberId} className="border-t border-[#1d253a]/80">
                      <td className="px-4 py-3 text-white">{m.displayName}</td>
                      <td className="px-4 py-3 text-slate-400">{m.role}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                        {m.outboundMessages}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'knowledge' && (
          <KnowledgeTabPanel data={knowledge} loading={loading} error={error} />
        )}

        {tab === 'ai' && (
          <AiTabPanel
            data={ai}
            loading={loading}
            error={error}
            organizationId={orgId}
            range={range}
          />
        )}
      </div>
    </div>
  )
}

function KnowledgeTabPanel({ data, loading, error }) {
  if (loading) return <p className="text-sm text-slate-400">Loading knowledge metrics…</p>
  if (error) return <p className="text-sm text-rose-400">{error}</p>
  if (!data) return null

  if (data.available === false) {
    return (
      <div className="rounded-xl border border-[#1d253a] bg-[#151b2e] p-6 text-sm text-slate-300">
        {data.message || 'Knowledge metrics are unavailable until the knowledge base is configured.'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ReportsKpiGrid kpis={data.kpis} />
      <div className="rounded-xl border border-[#1d253a] bg-[#151b2e] p-4 text-sm text-slate-300">
        <p>
          Draft articles: <span className="text-white">{data.totals?.draftArticles ?? 0}</span>
        </p>
        <p className="mt-1">
          Failed sources (total):{' '}
          <span className="text-white">{data.totals?.sourcesFailed ?? 0}</span>
        </p>
        <p className="mt-1">
          Successful ingestions in range:{' '}
          <span className="text-white">{data.totals?.ingestCompletedInRange ?? 0}</span>
        </p>
      </div>
    </div>
  )
}
