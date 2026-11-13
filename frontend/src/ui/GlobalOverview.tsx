/** OWNER: Agent B. B9/B12 — the global view: the question, the global number, ranked regions, tour. */
import { useApp } from '../shared/store'
import { REGIONS } from '../shared/regions'
import { humanLabel } from '../charts/stats'
import CountUp from './CountUp'
import { fmtPct, useYearTotals } from './data'
import { HeroCount, HumanHero, RecordBar } from './RecordBar'
import { TourButton } from './TopBar'

export default function GlobalOverview({ compact = false }: { compact?: boolean }) {
  const year = useApp((s) => s.year)
  const mode = useApp((s) => s.mode)
  const selectRegion = useApp((s) => s.selectRegion)
  const stopTour = useApp((s) => s.stopTour)
  const totals = useYearTotals(year)
  const human = mode === 'human'

  const ranked = totals
    ? REGIONS.map((r) => ({ r, t: totals.byRegion[r.id] }))
        .filter((x) => x.t)
        .sort((a, b) => (human ? b.t.human - a.t.human : b.t.pct - a.t.pct))
    : []
  const max = human ? 1 : (ranked[0]?.t.pct ?? 1)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label">Global view</span>
        <span className="readout text-[20px]">{year}</span>
      </div>
      <h1 className={`mt-1 leading-snug ${compact ? 'text-[18px]' : 'text-[20px]'}`}>
        {human ? (
          <>
            Where is fire <span className="text-missed">likely human-driven</span>, and where natural?
          </>
        ) : (
          <>
            How much of Earth’s fire has the historical record <span className="text-missed">missed</span>?
          </>
        )}
      </h1>
      {!compact && (
        <p className="mt-2 text-[13.5px] leading-relaxed text-dim">
          {human
            ? 'Nature has no weekends. Where fire follows the working week, people are likely behind it. Each area gets a likelihood, never a verdict on a single fire.'
            : 'NASA’s MODIS satellites have logged fires since 2000. VIIRS, flying since 2012, sees small fires MODIS cannot. We measure the gap, correct the long record, and show where it changes the story.'}
        </p>
      )}

      {totals && (
        <div className="mt-4 space-y-3">
          {human ? (
            <HumanHero value={totals.global.human} size="text-[38px]" />
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <HeroCount legacy={totals.global.legacy} harmonized={totals.global.harmonized} mode={mode} />
                <div className="text-right">
                  <div className="label">Undercount</div>
                  <CountUp value={totals.global.pct} format={(v) => `+${v.toFixed(1)}%`} className="readout block text-[34px] text-missed" />
                </div>
              </div>
              <RecordBar legacy={totals.global.legacy} harmonized={totals.global.harmonized} mode={mode} />
            </>
          )}

          <div className="border-t border-line pt-3">
            <div className="label mb-1.5">{human ? 'Most likely human-driven' : 'Most undercounted regions'}</div>
            {ranked.map(({ r, t }) => {
              const v = human ? t.human : t.pct
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    stopTour()
                    selectRegion(r.id)
                  }}
                  title={human ? humanLabel(t.human) : undefined}
                  className="group flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/5"
                >
                  <span className="w-40 truncate text-[13.5px] text-text/85 group-hover:text-text">{r.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-line">
                    <span
                      className="block h-full transition-[width,background-color] duration-500"
                      style={{
                        width: `${(v / max) * 100}%`,
                        background: human ? `color-mix(in oklab, var(--color-missed) ${Math.round(v * 100)}%, var(--color-cyan))` : 'var(--color-missed)',
                        opacity: 0.85,
                      }}
                    />
                  </span>
                  <span className="w-12 text-right font-mono text-[13px] text-missed">{human ? v.toFixed(2) : `+${fmtPct(v, 0)}`}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
        <TourButton />
        <span className="text-[13px] text-dim">A one-minute guided tour of the findings</span>
      </div>
    </div>
  )
}
