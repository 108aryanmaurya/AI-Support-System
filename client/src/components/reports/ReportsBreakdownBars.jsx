export function ReportsBreakdownBars({ title, items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const max = Math.max(1, ...rows.map((r) => r.count ?? 0))

  return (
    <section className="rounded-xl border border-[#1d253a] bg-[#151b2e] p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No breakdown data.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span className="capitalize">{String(row.key).replace(/_/g, ' ')}</span>
                <span className="tabular-nums text-slate-400">{row.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#0b1020]">
                <div
                  className="h-full rounded-full bg-violet-500/80"
                  style={{ width: `${Math.round(((row.count ?? 0) / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
