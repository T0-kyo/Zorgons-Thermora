/** OWNER: Agent B. B9 — what you see before picking a region: the question + global undercount. */
import { useApp } from '../shared/store'
import { REGIONS } from '../shared/regions'
import CountUp from './CountUp'
import { fmtPct, useYearTotals } from './data'
import { HeroCount, RecordBar } from './RecordBar'
import { TourButton } from './TopBar'

export default function GlobalOverview({ compact = false }: { compact?: boolean }) {
  const year = useApp((s) => s.year)
  const mode = useApp((s) => s.mode)
  const selectRegion = useApp((s) => s.selectRegion)
  const stopTour = useApp((s) => s.stopTour)
  const totals = useYearTotals(year)

  const ranked = totals
    ? REGIONS.map((r) => ({ r, t: totals.byRegion[r.id] }))
        .filter((x) => x.t)
        .sort((a, b) => b.t.pct - a.t.pct)
    : []
  const max = ranked[0]?.t.pct ?? 1

  return (
    <div>
      <div className="label">Global view · {year}</div>
      <h1 className={`mt-1 leading-snug font-semibold ${compact ? 'text-lg' : 'text-xl'}`}>
        How much of Earth’s fire has the historical record <span className="text-missed">missed</span>?
      </h1>
      {!compact && (
        <p className="mt-2 text-xs leading-relaxed text-dim">
          NASA’s MODIS satellites have logged fires since 2000. VIIRS, flying since 2012, sees small fires MODIS cannot. We measure the gap,
          correct the long record, and show where it changes the story.
        </p>
      )}

      {totals && (
        <div className="mt-4 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <HeroCount legacy={totals.global.legacy} harmonized={totals.global.harmonized} mode={mode} />
            <div className="text-right">
              <div className="label">undercount</div>
              <CountUp value={totals.global.pct} format={(v) => `+${v.toFixed(1)}%`} className="block font-mono text-3xl text-missed tabular-nums" />
            </div>
          </div>
          <RecordBar legacy={totals.global.legacy} harmonized={totals.global.harmonized} mode={mode} />

          <div className="border-t border-line pt-3">
            <div className="label mb-1.5">Most undercounted regions</div>
            {ranked.map(({ r, t }) => (
              <button
                key={r.id}
                onClick={() => {
                  stopTour()
                  selectRegion(r.id)
                }}
                className="group flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/5"
              >
                <span className="w-36 truncate text-xs text-text/85 group-hover:text-text">{r.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-line">
                  <span className="block h-full bg-missed/80 transition-[width] duration-500" style={{ width: `${(t.pct / max) * 100}%` }} />
                </span>
                <span className="w-11 text-right font-mono text-[11px] text-missed">+{fmtPct(t.pct, 0)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
        <TourButton />
        <span className="text-xs text-dim">60-second guided tour of the findings</span>
      </div>
    </div>
  )
}
