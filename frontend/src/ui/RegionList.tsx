/** OWNER: Agent B. B2 — region picker; the right column follows the toggle (undercount, or human likelihood). Phone chips (B10). */
import { useApp } from '../shared/store'
import { REGIONS } from '../shared/regions'
import { fmtPct, useYearTotals, type Totals } from './data'

const valueOf = (t: Totals | undefined, human: boolean) => (t ? (human ? t.human : t.pct) : 0)
const fmtValue = (t: Totals | undefined, human: boolean) => (!t ? '' : human ? t.human.toFixed(2) : `+${fmtPct(t.pct, 0)}`)

function MiniBar({ v, max, human }: { v: number; max: number; human: boolean }) {
  return (
    <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-line">
      <div
        className="h-full transition-[width,background-color] duration-500"
        style={{
          width: `${Math.min(100, (v / max) * 100)}%`,
          background: human ? `color-mix(in oklab, var(--color-missed) ${Math.round(v * 100)}%, var(--color-cyan))` : 'var(--color-missed)',
          opacity: 0.85,
        }}
      />
    </div>
  )
}

export default function RegionList() {
  const regionId = useApp((s) => s.regionId)
  const place = useApp((s) => s.place)
  const year = useApp((s) => s.year)
  const mode = useApp((s) => s.mode)
  const selectRegion = useApp((s) => s.selectRegion)
  const stopTour = useApp((s) => s.stopTour)
  const totals = useYearTotals(year)
  const human = mode === 'human'
  const max = human ? 1 : totals ? Math.max(...Object.values(totals.byRegion).map((t) => t.pct), 1) : 1

  const pick = (id: string | null) => {
    stopTour()
    selectRegion(id)
  }

  return (
    <nav aria-label="Countries" className="panel pointer-events-auto flex max-h-full w-64 shrink-0 flex-col bg-panel/60 p-2">
      <div className="flex items-baseline justify-between gap-3 px-2 pt-1 pb-2">
        <span className="label">Countries</span>
        <span className="label whitespace-nowrap">{human ? 'Human likelihood' : 'Undercount'}</span>
      </div>
      <button
        onClick={() => pick(null)}
        className={`mb-1 flex items-center justify-between rounded px-2 py-1.5 text-left text-[14px] transition-colors ${
          regionId === null && !place ? 'bg-cyan/10 text-cyan' : 'text-dim hover:bg-white/5 hover:text-text'
        }`}
      >
        <span>◎ Global view</span>
        {totals && <span className="font-mono text-[13px]">{fmtValue(totals.global, human)}</span>}
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
                <span className={`truncate text-[14px] ${active ? 'text-cyan' : 'text-text/85 group-hover:text-text'}`}>{r.name}</span>
                <span className="font-mono text-[13px] text-missed">{fmtValue(t, human)}</span>
              </div>
              <MiniBar v={valueOf(t, human)} max={max} human={human} />
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
        className={`shrink-0 rounded-full border px-3 py-1 text-[13px] whitespace-nowrap backdrop-blur-md transition-colors ${
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
