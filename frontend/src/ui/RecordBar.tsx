/** OWNER: Agent B. Shared pieces for the panels: mode-dependent hero, stacked record bar, sections. */
import type { ReactNode } from 'react'
import type { HumanStats, Mode } from '../shared/types'
import { humanLabel } from '../charts/stats'
import CountUp from './CountUp'
import { fmtInt } from './data'
import { HumanScale } from './HumanLegend'

/** Legacy fires (fire) + fires the legacy record missed (magenta) = harmonized total. */
export function RecordBar({ legacy, harmonized, mode }: { legacy: number; harmonized: number; mode: Mode }) {
  const missed = Math.max(0, harmonized - legacy)
  const lw = harmonized > 0 ? (legacy / harmonized) * 100 : 100
  const showMissed = mode !== 'legacy'
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-sm bg-line">
        <div className="h-full bg-fire transition-all duration-700" style={{ width: `${lw}%` }} />
        <div className={`h-full bg-missed transition-all duration-700 ${showMissed ? 'opacity-100' : 'opacity-0'}`} style={{ width: `${100 - lw}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[12.5px]">
        <span className="text-fire">
          Legacy record <span className="font-mono">{fmtInt(legacy)}</span>
        </span>
        <span className={showMissed ? 'text-missed' : 'text-dim'}>
          Missed <span className="font-mono">+{fmtInt(missed)}</span>
        </span>
      </div>
    </div>
  )
}

const HERO: Record<Exclude<Mode, 'human'>, { label: string; color: string }> = {
  legacy: { label: 'Fires in the legacy record (MODIS)', color: 'text-fire' },
  harmonized: { label: 'Fires after harmonization (MODIS + VIIRS)', color: 'text-cyan' },
  // kept for compatibility; the UI no longer offers this mode
  difference: { label: 'Fires after harmonization (MODIS + VIIRS)', color: 'text-cyan' },
}

/** The big fire count: flipping Legacy / Harmonized visibly changes it. */
export function HeroCount({ legacy, harmonized, mode }: { legacy: number; harmonized: number; mode: Mode }) {
  const h = HERO[mode === 'human' ? 'harmonized' : mode]
  const value = mode === 'legacy' ? legacy : harmonized
  return (
    <div>
      <div className="label">{h.label}</div>
      <CountUp value={value} format={fmtInt} className={`readout block text-[34px] ${h.color} transition-colors`} />
    </div>
  )
}

/** B12 — "Human vs natural" hero: the area's likelihood that its fire is human-driven. */
export function HumanHero({ value, legacy, stats, period, size = 'text-[40px]' }: { value: number; legacy?: number; stats?: HumanStats; period?: string; size?: string }) {
  return (
    <div>
      <div className="label">Human likelihood for this area</div>
      <div className="flex items-baseline gap-3">
        {Number.isFinite(value) ? <CountUp value={value} format={(v) => v.toFixed(2)} className={`readout ${size} text-missed`} /> : <span className={`readout ${size} text-dim`}>—</span>}
        <span className="text-[15px]">{humanLabel(value)}</span>
      </div>
      <div className="mt-3">
        <HumanScale
          markers={
            legacy != null && Number.isFinite(legacy)
              ? [
                  { value: legacy, label: 'Legacy', tone: 'fire' },
                  { value, label: 'Corrected', tone: 'text' },
                ]
              : [{ value, label: 'This area', tone: 'text' }]
          }
          range={stats ? [stats.low, stats.high] : undefined}
        />
      </div>
      {stats && Number.isFinite(value) && <HumanEvidence stats={stats} period={period} />}

    </div>
  )
}

export function Section({ q, title, children }: { q?: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3">
      <div className="mb-2 flex items-baseline gap-2">
        {q && <span className="text-[12px] text-cyan">{q}</span>}
        <h3 className="text-[15px]">{title}</h3>
      </div>
      {children}
    </section>
  )
}

const LEVEL_WORD = { low: 'Low', medium: 'Medium', high: 'High' } as const

/**
 * What the human score rests on, straight from the science team's table via the backend:
 * the 95% range, how confident the scoring is, and how many fires were scored.
 * Each line appears only when the backend sends it.
 */
export function HumanEvidence({ stats, period, compact = false }: { stats: HumanStats; period?: string; compact?: boolean }) {
  const hasRange = Number.isFinite(stats.low) && Number.isFinite(stats.high)
  const scored = Number.isFinite(stats.scoredFires) ? stats.scoredFires : null
  const total = Number.isFinite(stats.totalFires) && scored != null && stats.totalFires >= scored ? stats.totalFires : null
  const c = stats.counts
  const n = c ? c.low + c.medium + c.high : 0
  return (
    <dl className={`mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 ${compact ? 'text-[12px]' : 'text-[13px]'}`}>
      {hasRange && (
        <>
          <dt className="text-dim">95% range</dt>
          <dd className="font-mono">{stats.low.toFixed(2)} to {stats.high.toFixed(2)}</dd>
        </>
      )}
      {stats.confidence && (
        <>
          <dt className="text-dim">Confidence</dt>
          <dd>
            {LEVEL_WORD[stats.confidence]}
            {c && n > 0 && (
              <span className="ml-2 inline-flex h-1.5 w-24 overflow-hidden rounded-sm align-middle" aria-label={`${c.high} high, ${c.medium} medium, ${c.low} low`} title={`${c.high.toLocaleString()} high, ${c.medium.toLocaleString()} medium, ${c.low.toLocaleString()} low`}>
                <span className="bg-text" style={{ width: `${(c.high / n) * 100}%` }} />
                <span className="bg-text/45" style={{ width: `${(c.medium / n) * 100}%` }} />
                <span className="bg-text/15" style={{ width: `${(c.low / n) * 100}%` }} />
              </span>
            )}
          </dd>
        </>
      )}
      {scored != null && (
        <>
          <dt className="text-dim">Based on</dt>
          <dd>
            {total != null ? `${scored.toLocaleString()} of ${total.toLocaleString()} fires scored` : `${scored.toLocaleString()} scored fires`}
            {period && <span className="text-dim">, {period}</span>}
          </dd>
        </>
      )}
    </dl>
  )
}
