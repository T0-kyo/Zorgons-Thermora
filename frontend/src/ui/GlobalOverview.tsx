/** OWNER: Agent B. B9/B12 — the global view: the question, the global number, ranked regions, tour. */
import { fmtHuman } from '../charts/stats'
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
        .sort((a, b) => (human ? (Number.isFinite(b.t.human) ? b.t.human : -1) - (Number.isFinite(a.t.human) ? a.t.human : -1) : b.t.pct - a.t.pct))
    : []
  const max = human ? 1 : (ranked[0]?.t.pct ?? 1)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label">Global view</span>
        <span className="readout text-[20px]">{year}</span>
      </div>
      <h1 className={compact ? 'mt-1 text-[26px]' : 'mt-2'}>{human ? 'Who lit it?' : 'What did the old record miss?'}</h1>
      {!compact && (
        <p className="mt-3 max-w-[36ch] text-[15px] leading-relaxed text-dim">
          {human
            ? 'The science team scores each fire for its link to human activity. Each area shows the average score, never a verdict on one fire.'
            : 'MODIS has logged fires since 2000. VIIRS, flying since 2012, sees small fires MODIS cannot. Combining both shows how many fires MODIS alone misses.'}
        </p>
      )}

      {totals && (
        <div className="mt-4 space-y-3">
          {!totals.global ? (
            <p className="text-sm text-warn">Worldwide totals are unavailable right now.</p>
          ) : human ? (
            <HumanHero value={totals.global!.human} size="text-[38px]" />
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <HeroCount legacy={totals.global!.legacy} harmonized={totals.global!.harmonized} mode={mode} />
                <div className="text-right">
                  <div className="label">Undercount</div>
                  <CountUp value={totals.global!.pct} format={(v) => `+${v.toFixed(1)}%`} className="readout block text-[34px] text-missed" />
                </div>
              </div>
              <RecordBar legacy={totals.global!.legacy} harmonized={totals.global!.harmonized} mode={mode} />
            </>
          )}

          <div className="border-t border-line pt-3">
            <div className="label mb-1.5">{human ? 'Most likely human-driven' : 'Most undercounted countries'}</div>
            {ranked.slice(0, 8).map(({ r, t }) => {
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
                  <span className="w-12 text-right font-mono text-[13px] text-missed">{human ? fmtHuman(v) : `+${fmtPct(v, 0)}`}</span>
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
