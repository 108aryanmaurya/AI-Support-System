import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAnalyticsAiRuns } from '../../services/analyticsApi.js'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'blocked_policy', label: 'Blocked' },
]

/**
 * @param {object} props
 * @param {string} props.organizationId
 * @param {{ from: string, to: string }} props.range
 */
export function AiRunsTable({ organizationId, range }) {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetchAnalyticsAiRuns(organizationId, range, {
        page,
        pageSize: 20,
        ...(statusFilter ? { status: statusFilter } : {}),
      })
      setData(res)
    } catch (e) {
      setError(e.message || 'Failed to load AI runs.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [organizationId, range, page, statusFilter])

  useEffect(() => {
    setPage(1)
  }, [range.from, range.to, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  if (data?.available === false) {
    return (
      <p className="text-sm text-slate-400">
        Run history is unavailable until AI tables are migrated.
      </p>
    )
  }

  const pagination = data?.pagination
  const items = data?.items ?? []

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Recent AI runs</h3>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[#2b3858] bg-[#151b2e] px-2 py-1 text-sm text-white"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-[#1d253a] bg-[#151b2e]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#1d253a] bg-[#0f1424] text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Feature</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Latency</th>
              <th className="px-3 py-2 font-medium text-right">Tokens</th>
              <th className="px-3 py-2 font-medium">Conversation</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  Loading runs…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No runs in this period.
                </td>
              </tr>
            ) : (
              items.map((run) => {
                const tokens = (run.inputTokens ?? 0) + (run.outputTokens ?? 0)
                const when = run.createdAt
                  ? new Date(run.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'
                const statusClass =
                  run.status === 'success'
                    ? 'text-emerald-300'
                    : run.status === 'timeout'
                      ? 'text-amber-300'
                      : 'text-rose-300'

                return (
                  <tr key={run.id} className="border-t border-[#1d253a]/80">
                    <td className="px-3 py-2 text-slate-300" title={run.createdAt}>
                      {when}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-200">
                      {run.feature}
                    </td>
                    <td className={`px-3 py-2 text-xs capitalize ${statusClass}`}>
                      {run.status}
                      {run.errorCode ? (
                        <span className="ml-1 text-slate-500" title={run.errorCode}>
                          ({run.errorCode.slice(0, 24)})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {run.latencyMs != null ? `${run.latencyMs} ms` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {tokens > 0 ? tokens : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {run.conversationId ? (
                        <Link
                          to={`/org/${organizationId}/inbox?conversation=${run.conversationId}`}
                          className="font-mono text-xs text-sky-300 hover:text-sky-200"
                        >
                          {run.conversationId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} runs)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-[#2b3858] px-2 py-1 hover:bg-[#1a2338] disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={loading || pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-[#2b3858] px-2 py-1 hover:bg-[#1a2338] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
