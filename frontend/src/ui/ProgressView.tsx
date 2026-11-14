/**
 * OWNER: Agent B. B16 — "How much worse since 2001?" for the selected region or place.
 * Hero follows the toggle: Legacy uses the legacy series, Harmonized the corrected one,
 * Human vs natural shows the area's human likelihood.
 */
import { fmtHuman } from '../charts/stats'
import { useApp } from '../shared/store'
import type { Mode, ProgressSummary, Target } from '../shared/types'
import Sparkline from '../charts/Sparkline'
import CountUp from './CountUp'
import { fmtInt, useProgress } from './data'
import { HumanScale } from './HumanLegend'
import { HumanHero } from './RecordBar'
import { RegionFindings } from './SpotlightPanel'

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1)

/** Same definition as the API: mean of the first 3 years vs the last 3, ±10 % = stable. */
function changeFor(p: ProgressSummary, mode: Mode) {
  if (mode !== 'legacy') return { baseline: p.baseline, recent: p.recent, pct: p.changePct, direction: p.direction }
  const baseline = mean(p.series.slice(0, 3).map((x) => x.legacy))
  const recent = mean(p.series.slice(-3).map((x) => x.legacy))
  const pct = baseline ? ((recent - baseline) / baseline) * 100 : 0
  return { baseline, recent, pct, direction: pct > 10 ? 'worse' : pct < -10 ? 'better' : ('stable' as ProgressSummary['direction']) }
}

const DIRECTION = {
  worse: { words: 'Getting worse', cls: 'text-fire', bar: 'bg-fire' },
  better: { words: 'Getting better', cls: 'text-ok', bar: 'bg-ok' },
  stable: { words: 'Stable', cls: 'text-text', bar: 'bg-dim' },
} as const

function ChangeBar({ baseline, recent, direction, first, last }: { baseline: number; recent: number; direction: ProgressSummary['direction']; first: number; last: number }) {
  const max = Math.max(baseline, recent, 1) * 1.08
  const a = (Math.min(baseline, recent) / max) * 100
  const b = (Math.max(baseline, recent) / max) * 100
  const d = DIRECTION[direction]
  return (
    <div>
      <div className="relative h-3 rounded-sm bg-line">
        <div className="absolute inset-y-0 left-0 rounded-l-sm bg-text/15 transition-all duration-700" style={{ width: `${a}%` }} />
        <div className={`absolute inset-y-0 ${d.bar} opacity-80 transition-all duration-700`} style={{ left: `${a}%`, width: `${b - a}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-text/70 transition-all duration-700" style={{ left: `${(baseline / max) * 100}%` }} title="2001–03 average" />
        <div className="absolute -inset-y-1 w-0.5 bg-text transition-all duration-700" style={{ left: `${(recent / max) * 100}%` }} title="Recent average" />
      </div>
      <div className="mt-1.5 flex justify-between text-[12.5px]">
        <span className="text-dim">
          {first}–{String(first + 2).slice(2)} average <span className="font-mono text-text">{fmtInt(baseline)}</span>
        </span>
        <span className="text-dim">
          {last - 2}–{String(last).slice(2)} average <span className="font-mono text-text">{fmtInt(recent)}</span>
        </span>
      </div>
      <div className="mt-0.5 text-right text-[11.5px] text-dim">fires per year</div>
    </div>
  )
}

export function OutsideNotice() {
  return (
    <div className="mt-3 rounded border border-warn/40 bg-warn/10 px-3 py-2.5 text-[14px] text-warn">
      Outside the countries with data. No data here yet.
      <div className="mt-1 text-[12.5px] text-warn/80">Try a spot inside one of the regions on the left, or search for a place.</div>
    </div>
  )
}

export default function ProgressView({ target }: { target: Target }) {
  const mode = useApp((s) => s.mode)
  const year = useApp((s) => s.year)
  const { data: p, error, loading } = useProgress(target)
  const regionId = target.kind === 'region' ? target.regionId : target.place.regionId

  if (error) return <p className="mt-3 text-sm text-warn">Progress data is unavailable right now.</p>
  if (loading || !p)
    return (
      <div className="mt-3 animate-pulse space-y-3">
        <div className="h-10 w-1/2 rounded bg-line" />
        <div className="h-3 rounded bg-line" />
        <div className="h-28 rounded bg-line" />
      </div>
    )
  if (!p.covered) return <OutsideNotice />

  const c = changeFor(p, mode)
  const d = DIRECTION[c.direction]
  const human = mode === 'human'

  return (
    <div className="mt-3 space-y-4">
      {human ? (
        <HumanHero value={p.humanLikelihood.harmonized} legacy={p.humanLikelihood.legacy} />
      ) : (
        <div>
          <div className="label">
            Fire activity since {p.years.first}, harmonized record
          </div>
          <div className="flex items-baseline gap-3">
            <CountUp
              value={c.pct}
              format={(v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}%`}
              className={`readout text-[44px] ${d.cls} transition-colors`}
            />
            <span className={`text-[16px] ${d.cls}`}>{d.words}</span>
          </div>
        </div>
      )}

      {human && (
        <div className="flex items-baseline gap-2 text-[13.5px]">
          <span className="text-dim">Fire activity since {p.years.first}</span>
          <span className={`font-mono ${d.cls}`}>
            {c.pct >= 0 ? '+' : '−'}
            {Math.abs(c.pct).toFixed(0)}%
          </span>
          <span className={d.cls}>{d.words.toLowerCase()}</span>
        </div>
      )}
      <ChangeBar baseline={c.baseline} recent={c.recent} direction={c.direction} first={p.years.first} last={p.years.last} />

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="label">Fires per year</span>
          <span className="text-[12px]">
            <span className="text-cyan">Harmonized</span> <span className="text-dim">and</span> <span className="text-fire">legacy</span>
          </span>
        </div>
        <Sparkline series={p.series} year={year} mode={mode} />
      </div>

      {!human && (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="label">Human likelihood for this area</span>
            <span className="font-mono text-[14px] text-missed">{fmtHuman(p.humanLikelihood.harmonized)}</span>
          </div>
          <HumanScale
            compact
            markers={[
              { value: p.humanLikelihood.legacy, label: 'Legacy', tone: 'fire' },
              { value: p.humanLikelihood.harmonized, label: 'Corrected', tone: 'text' },
            ]}
          />
        </div>
      )}

      {regionId && <RegionFindings regionId={regionId} isPlace={target.kind === 'place'} />}
    </div>
  )
}
