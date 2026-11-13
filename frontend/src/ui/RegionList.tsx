/** OWNER: Agent B. B2 — region picker with mini undercount %, plus phone chips (B10). */
import { useApp } from '../shared/store'
import { REGIONS } from '../shared/regions'
import { fmtPct, useYearTotals } from './data'

function MiniBar({ pct, max }: { pct: number; max: number }) {
  return (
    <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-line">
      <div className="h-full bg-missed/80 transition-[width] duration-500" style={{ width: `${Math.min(100, (pct / max) * 100)}%` }} />
    </div>
  )
}

export default function RegionList() {
  const regionId = useApp((s) => s.regionId)
  const year = useApp((s) => s.year)
  const selectRegion = useApp((s) => s.selectRegion)
  const stopTour = useApp((s) => s.stopTour)
  const totals = useYearTotals(year)
  const max = totals ? Math.max(...Object.values(totals.byRegion).map((t) => t.pct), 1) : 1

  const pick = (id: string | null) => {
    stopTour()
    selectRegion(id)
  }

  return (
    <nav className="panel pointer-events-auto flex max-h-full w-64 shrink-0 flex-col p-2">
      <div className="flex items-baseline justify-between gap-3 px-2 pt-1 pb-2">
        <span className="label">Regions</span>
        <span className="label whitespace-nowrap">undercount · {year}</span>
      </div>
      <button
        onClick={() => pick(null)}
        className={`mb-1 flex items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors ${
          regionId === null ? 'bg-cyan/10 text-cyan' : 'text-dim hover:bg-white/5 hover:text-text'
        }`}
      >
        <span>◎ Global view</span>
        {totals && <span className="font-mono text-xs">+{fmtPct(totals.global.pct, 0)}</span>}
      </button>
      <div className="min-h-0 overflow-y-auto">
        {REGIONS.map((r) => {
          const t = totals?.byRegion[r.id]
          const active = regionId === r.id
          return (
            <button
              key={r.id}
              onClick={() => pick(r.id)}
              aria-pressed={active}
              className={`group block w-full rounded border px-2 py-1.5 text-left transition-colors ${
                active ? 'border-cyan/40 bg-cyan/10' : 'border-transparent hover:bg-white/5'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-sm ${active ? 'text-cyan' : 'text-text/85 group-hover:text-text'}`}>{r.name}</span>
                <span className="font-mono text-xs text-missed">{t ? `+${fmtPct(t.pct, 0)}` : '—'}</span>
              </div>
              <MiniBar pct={t?.pct ?? 0} max={max} />
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/** Phone version: one horizontally scrolling row of chips. */
export function RegionChips() {
  const regionId = useApp((s) => s.regionId)
  const selectRegion = useApp((s) => s.selectRegion)
  const stopTour = useApp((s) => s.stopTour)
  const chip = (id: string | null, label: string) => {
    const active = regionId === id
    return (
      <button
        key={id ?? 'global'}
        onClick={() => {
          stopTour()
          selectRegion(id)
        }}
        className={`shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap backdrop-blur-md transition-colors ${
          active ? 'border-cyan/60 bg-cyan/15 text-cyan' : 'border-line bg-panel text-text/80'
        }`}
      >
        {label}
      </button>
    )
  }
  return (
    <div className="pointer-events-auto -mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1 [scrollbar-width:none]">
      {chip(null, '◎ Global')}
      {REGIONS.map((r) => chip(r.id, r.name))}
    </div>
  )
}
