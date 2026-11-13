/**
 * OWNER: Agent B. B13 — natural → human legend (cyan → missed), the same ramp the globe uses
 * in "Human vs natural" mode. Optional markers show an area's likelihood (legacy L, harmonized H).
 * Wording rule: a likelihood for an AREA, never a label on a single fire.
 */
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

export function HumanScale({ markers = [], compact = false }: { markers?: Marker[]; compact?: boolean }) {
  return (
    <div>
      <div className="relative">
        <div className={`${compact ? 'h-1.5' : 'h-2'} rounded-sm`} style={{ background: RAMP }} />
        {markers.map((m) => (
          <div
            key={m.label}
            className="absolute -top-1 bottom-[-4px] w-0 transition-[left] duration-700"
            style={{ left: `${Math.min(100, Math.max(0, m.value * 100))}%` }}
            title={`${m.label}: ${m.value.toFixed(2)}`}
          >
            <div className={`mx-[-1px] h-full w-0.5 rounded ${TONE[m.tone]}`} />
            {!compact && <div className="absolute top-full mt-0.5 -translate-x-1/2 text-[11px] text-dim">{m.label}</div>}
          </div>
        ))}
      </div>
      <div className={`flex justify-between text-[12px] text-dim ${!compact && markers.length ? 'mt-4' : 'mt-1'}`}>
        <span className="text-cyan">Likely natural</span>
        <span className="text-missed">Likely human-driven</span>
      </div>
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
            A likelihood for each area, from its weekly rhythm. Not a label on any single fire.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
