/** OWNER: Agent B. Shared pieces for the panels: mode-dependent hero, stacked record bar, sections. */
import type { ReactNode } from 'react'
import type { Mode } from '../shared/types'
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
export function HumanHero({ value, legacy, size = 'text-[40px]' }: { value: number; legacy?: number; size?: string }) {
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
            legacy != null
              ? [
                  { value: legacy, label: 'Legacy', tone: 'fire' },
                  { value, label: 'Corrected', tone: 'text' },
                ]
              : [{ value, label: 'This area', tone: 'text' }]
          }
        />
      </div>

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
