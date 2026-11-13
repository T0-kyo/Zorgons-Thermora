/** OWNER: Agent B. Shared pieces for the spotlight + overview: stacked record bar and hero count. */
import type { ReactNode } from 'react'
import type { Mode } from '../shared/types'
import CountUp from './CountUp'
import { fmtInt } from './data'

/** Legacy fires (fire) + fires the legacy record missed (magenta) = harmonized total. */
export function RecordBar({ legacy, harmonized, mode }: { legacy: number; harmonized: number; mode: Mode }) {
  const missed = Math.max(0, harmonized - legacy)
  const lw = harmonized > 0 ? (legacy / harmonized) * 100 : 100
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-sm bg-line">
        <div className={`h-full bg-fire transition-all duration-700 ${mode === 'difference' ? 'opacity-35' : ''}`} style={{ width: `${lw}%` }} />
        <div
          className={`h-full bg-missed transition-all duration-700 ${mode === 'legacy' ? 'opacity-0' : 'opacity-100'}`}
          style={{ width: `${100 - lw}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px]">
        <span className="text-fire">■ legacy {fmtInt(legacy)}</span>
        <span className={mode === 'legacy' ? 'text-dim' : 'text-missed'}>■ missed +{fmtInt(missed)}</span>
      </div>
    </div>
  )
}

const HERO: Record<Mode, { label: string; color: string; prefix: string }> = {
  legacy: { label: 'Fires in the legacy record (MODIS)', color: 'text-fire', prefix: '' },
  harmonized: { label: 'Fires after harmonization (MODIS + VIIRS)', color: 'text-cyan', prefix: '' },
  difference: { label: 'Fires the legacy record missed', color: 'text-missed', prefix: '+' },
}

/** The big mode-dependent number: flipping the toggle visibly changes it. */
export function HeroCount({ legacy, harmonized, mode, size = 'text-3xl' }: { legacy: number; harmonized: number; mode: Mode; size?: string }) {
  const h = HERO[mode]
  const value = mode === 'legacy' ? legacy : mode === 'harmonized' ? harmonized : harmonized - legacy
  return (
    <div>
      <div className="label">{h.label}</div>
      <CountUp value={value} format={(v) => h.prefix + fmtInt(v)} className={`block font-mono ${size} tabular-nums ${h.color} transition-colors`} />
    </div>
  )
}

export function Section({ q, title, children }: { q: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-[10px] text-cyan">{q}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  )
}
