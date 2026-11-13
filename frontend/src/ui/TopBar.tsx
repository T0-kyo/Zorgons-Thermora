/** OWNER: Agent B. B1 — brand, Legacy / Harmonized / Missed toggle, live UTC clock, tour + about. */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../shared/store'
import { USING_MOCK } from '../shared/api'
import type { Mode } from '../shared/types'
import { useUi } from './uiStore'

const MODES: { id: Mode; label: string; short: string; on: string; pill: string }[] = [
  { id: 'legacy', label: 'Legacy · MODIS', short: 'Legacy', on: 'text-fire', pill: 'bg-fire/15 border-fire/50' },
  { id: 'harmonized', label: 'Harmonized', short: 'Harmonized', on: 'text-cyan', pill: 'bg-cyan/15 border-cyan/50' },
  { id: 'difference', label: 'Missed fires', short: 'Missed', on: 'text-missed', pill: 'bg-missed/15 border-missed/50' },
]

export function ModeToggle({ compact = false }: { compact?: boolean }) {
  const mode = useApp((s) => s.mode)
  const setMode = useApp((s) => s.setMode)
  return (
    <div role="radiogroup" aria-label="Fire record" className="flex rounded-md border border-line bg-ink/40 p-0.5">
      {MODES.map((m) => {
        const active = mode === m.id
        return (
          <button
            key={m.id}
            role="radio"
            aria-checked={active}
            onClick={() => setMode(m.id)}
            className={`relative flex-1 whitespace-nowrap rounded px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors ${
              active ? m.on : 'text-dim hover:text-text'
            }`}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className={`absolute inset-0 rounded border ${m.pill}`}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{compact ? m.short : m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function UtcClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const iso = now.toISOString()
  return (
    <div className="text-right leading-tight">
      <div className="font-mono text-sm tabular-nums text-text">{iso.slice(11, 19)}</div>
      <div className="label">UTC · {iso.slice(0, 10)}</div>
    </div>
  )
}

export function MockBadge() {
  if (!USING_MOCK) return null
  return (
    <span
      title="Numbers are placeholders until the backend is connected"
      className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[9px] tracking-widest whitespace-nowrap text-warn"
    >
      MOCK DATA — NOT REAL RESULTS
    </span>
  )
}

export function TourButton({ className = '' }: { className?: string }) {
  const touring = useApp((s) => s.touring)
  const startTour = useApp((s) => s.startTour)
  const stopTour = useApp((s) => s.stopTour)
  return (
    <button
      data-tour-btn
      onClick={() => (touring ? stopTour() : startTour())}
      className={`rounded border px-3 py-1.5 font-mono text-[11px] tracking-wider whitespace-nowrap uppercase transition-colors ${
        touring ? 'border-missed/50 bg-missed/15 text-missed' : 'border-cyan/40 text-cyan hover:bg-cyan/10'
      } ${className}`}
    >
      {touring ? '■ Stop tour' : '▶ Tour'}
    </button>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-cyan)" strokeOpacity="0.6" />
        <path d="M12 5c2.5 3 4 5 4 7.5a4 4 0 0 1-8 0C8 10.8 9 9.6 10 8.6c.2 1.3.9 2.2 1.8 2.6C11.5 9 11.6 7 12 5z" fill="var(--color-fire)" />
      </svg>
      <div className="leading-tight">
        <div className="font-semibold tracking-[0.28em]">THERMORA</div>
        <div className="label hidden lg:block">MODIS × VIIRS · the corrected fire record</div>
      </div>
    </div>
  )
}

export default function TopBar({ compact = false }: { compact?: boolean }) {
  const setAbout = useUi((s) => s.setAbout)
  const about = (
    <button
      onClick={() => setAbout(true)}
      aria-label="About and methods"
      className="rounded border border-line px-2.5 py-1.5 font-mono text-[11px] text-dim uppercase hover:text-text"
    >
      {compact ? 'ⓘ' : 'ⓘ Methods'}
    </button>
  )

  if (compact) {
    return (
      <header className="panel pointer-events-auto space-y-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <Brand />
          <div className="ml-auto flex items-center gap-1.5">
            <TourButton />
            {about}
          </div>
        </div>
        <ModeToggle compact />
        <div className="flex justify-center">
          <MockBadge />
        </div>
      </header>
    )
  }

  return (
    <header className="panel pointer-events-auto flex items-center gap-4 px-4 py-2">
      <Brand />
      <MockBadge />
      <div className="mx-auto">
        <ModeToggle />
      </div>
      <TourButton />
      {about}
      <UtcClock />
    </header>
  )
}
