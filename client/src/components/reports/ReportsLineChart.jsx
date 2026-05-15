export function ReportsLineChart({ title, series = [], emptyLabel = 'No data' }) {
  const points = Array.isArray(series) ? series : []
  const max = Math.max(1, ...points.map((p) => p.v ?? 0))

  return (
    <section className="rounded-xl border border-[#1d253a] bg-[#151b2e] p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {points.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="mt-4 flex h-32 items-end gap-1">
          {points.map((p) => {
            const h = Math.round(((p.v ?? 0) / max) * 100)
            return (
              <div
                key={p.t}
                className="group flex min-w-0 flex-1 flex-col items-center gap-1"
                title={`${p.t}: ${p.v}`}
              >
                <div
                  className="w-full max-w-[28px] rounded-t bg-[#3b82f6]/80 transition group-hover:bg-[#60a5fa]"
                  style={{ height: `${Math.max(h, 4)}%` }}
                />
                <span className="hidden truncate text-[9px] text-slate-500 sm:block">
                  {String(p.t).slice(5)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
