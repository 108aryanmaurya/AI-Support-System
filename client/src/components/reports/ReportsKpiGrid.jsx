function formatValue(kpi) {
  if (kpi.unit === 'percent') return `${kpi.value}%`
  return String(kpi.value ?? 0)
}

function DeltaBadge({ delta }) {
  if (delta == null || delta === 0) {
    return <span className="text-xs text-slate-500">— vs prior period</span>
  }
  const positive = delta > 0
  const color = positive ? 'text-emerald-400' : 'text-rose-400'
  const sign = positive ? '+' : ''
  return (
    <span className={`text-xs font-medium ${color}`}>
      {sign}
      {delta}% vs prior period
    </span>
  )
}

export function ReportsKpiGrid({ kpis = [] }) {
  if (!kpis.length) {
    return <p className="text-sm text-slate-400">No metrics for this period.</p>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {kpis.map((kpi) => (
        <article
          key={kpi.id}
          className="rounded-xl border border-[#1d253a] bg-[#151b2e] px-4 py-4"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {kpi.label}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-white">
            {formatValue(kpi)}
          </p>
          <div className="mt-2">
            <DeltaBadge delta={kpi.deltaPercent} />
          </div>
        </article>
      ))}
    </div>
  )
}
