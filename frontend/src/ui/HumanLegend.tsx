/**
 * OWNER: Agent B. B13 — natural → human legend (cyan → missed), the same ramp the globe uses
 * in "Human vs natural" mode. Optional markers show an area's likelihood (legacy L, harmonized H).
 * Wording rule: a likelihood for an AREA, never a label on a single fire.
 */
import { fmtHuman } from '../charts/stats'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../shared/store'

const RAMP = 'linear-gradient(90deg, var(--color-cyan), color-mix(in oklab, var(--color-cyan) 45%, var(--color-missed)) 50%, var(--color-missed))'

interface Marker {
  value: number
  label: string
  /** tailwind text/border colour classes */
  tone: 'fire' | 'cyan' | 'text'
}
const TONE = { fire: 'bg-fire', cyan: 'bg-cyan', text: 'bg-text' }

export function HumanScale({ markers = [], compact = false, range }: { markers?: Marker[]; compact?: boolean; range?: [number, number] }) {
  const band = range && Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[1] >= range[0] ? range : null
  return (
    <div>
      <div className="relative">
        <div className={`${compact ? 'h-1.5' : 'h-2'} rounded-sm`} style={{ background: RAMP }} />
        {band && (
          // the 95% range around the score: a bracket over the ramp
          <div
            className="absolute -top-1.5 bottom-[-6px] rounded-sm border border-text/70 bg-white/10 transition-[left,width] duration-700"
            style={{ left: `${band[0] * 100}%`, width: `${Math.max(0.6, (band[1] - band[0]) * 100)}%` }}
            title={`95% range ${band[0].toFixed(2)} to ${band[1].toFixed(2)}`}
          />
        )}
        {markers.filter((m) => Number.isFinite(m.value)).map((m) => (
          <div
            key={m.label}
            className="absolute -top-1 bottom-[-4px] w-0 transition-[left] duration-700"
            style={{ left: `${Math.min(100, Math.max(0, m.value * 100))}%` }}
            title={`${m.label}: ${m.value.toFixed(2)}`}
          >
            <div className={`mx-[-1px] h-full w-0.5 rounded ${TONE[m.tone]}`} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-dim">
        <span className="text-cyan">Likely natural</span>
        <span className="text-missed">Likely human-driven</span>
      </div>
      {!compact && markers.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-dim">
          {markers.filter((m) => Number.isFinite(m.value)).map((m) => (
            <span key={m.label} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-3 w-0.5 rounded ${TONE[m.tone]}`} />
              {m.label} <span className="font-mono text-text">{fmtHuman(m.value)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Floating map legend, shown only in "Human vs natural" mode. */
export default function MapLegend({ className = '' }: { className?: string }) {
  const mode = useApp((s) => s.mode)
  return (
    <AnimatePresence>
      {mode === 'human' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25 }}
          className={`panel pointer-events-auto w-60 px-3 py-2 ${className}`}
        >
          <div className="label mb-1.5">Fire colour on the globe</div>
          <HumanScale compact />
          <p className="mt-1.5 text-[11.5px] leading-snug text-dim">
            The average human score for each area, never a label on a single fire. Grey: no score.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
