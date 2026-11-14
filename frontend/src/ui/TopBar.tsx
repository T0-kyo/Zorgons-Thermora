/** OWNER: Agent B. B1/B12 — wordmark, Legacy / Harmonized / Human vs natural toggle, UTC clock + sun, tour, methods. */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../shared/store'
import { anyFailed, useDataStatus } from '../shared/dataStatus'
import { sunPosition } from '../shared/sun'
import type { Mode } from '../shared/types'
import { useUi } from './uiStore'

/** 'difference' stays supported by the globe but is no longer offered in the UI (team decision, B12). */
const MODES: { id: Mode; label: string; short: string; on: string; pill: string }[] = [
  { id: 'human', label: 'Human or natural', short: 'Human or natural', on: 'text-missed', pill: 'bg-missed/15 border-missed/50' },
  { id: 'harmonized', label: 'Harmonized (MODIS + VIIRS)', short: 'Harmonized', on: 'text-cyan', pill: 'bg-cyan/15 border-cyan/50' },
]

export function ModeToggle({ compact = false }: { compact?: boolean }) {
  const mode = useApp((s) => s.mode)
  const setMode = useApp((s) => s.setMode)
  // the old 'difference' mode (e.g. from a saved state) shows as Harmonized
  const shown: Mode = mode === 'human' ? 'human' : 'harmonized'
  return (
    <div role="radiogroup" aria-label="Fire record" className="flex rounded border border-line bg-ink/40 p-0.5">
      {MODES.map((m) => {
        const active = shown === m.id
        return (
          <button
            key={m.id}
            role="radio"
            aria-checked={active}
            onClick={() => setMode(m.id)}
            className={`relative flex-1 rounded px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors ${
              active ? m.on : 'text-dim hover:text-text'
            } ${compact ? 'px-2' : ''}`}
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

const fmtDeg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`

export function UtcClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const iso = now.toISOString()
  const sun = sunPosition(now)
  return (
    <div className="flex items-center gap-4 leading-tight">
      <div className="hidden text-right xl:block" title="Subsolar point: where the Sun is directly overhead right now">
        <div className="font-mono text-sm text-text">
          {fmtDeg(sun.lat, 'N', 'S')} {fmtDeg(sun.lng, 'E', 'W')}
        </div>
        <div className="label">Sun overhead</div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm text-text">{iso.slice(11, 19)}</div>
        <div className="label">
          UTC <span className="text-dim/80">{iso.slice(0, 10)}</span>
        </div>
      </div>
    </div>
  )
}

/** Data badge: live, connecting, or unreachable. There is no sample data to fall back to. */
export function MockBadge() {
  const backend = useDataStatus((s) => s.backend)
  const sources = useDataStatus((s) => s.sources)
  if (backend === 'down' || anyFailed(sources)) {
    return (
      <span title="The backend did not answer. Nothing is shown in place of its data." className="rounded border border-warn/40 bg-warn/10 px-2 py-0.5 text-[12px] whitespace-nowrap text-warn">
        Backend unreachable
      </span>
    )
  }
  if (backend !== 'up' || !Object.values(sources).includes('real')) {
    return <span className="rounded border border-line px-2 py-0.5 text-[12px] whitespace-nowrap text-dim">Connecting to data…</span>
  }
  return (
    <span title="All numbers on screen come from the team's backend" className="rounded border border-ok/40 bg-ok/10 px-2 py-0.5 text-[12px] whitespace-nowrap text-ok">
      Live data
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
      className={`rounded border px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors ${
        touring ? 'border-missed/50 bg-missed/15 text-missed' : 'border-cyan/40 text-cyan hover:bg-cyan/10'
      } ${className}`}
    >
      {touring ? 'Stop tour' : 'Start tour'}
    </button>
  )
}

function Brand() {
  return (
    <div className="leading-tight">
      <span className="wordmark text-[20px]">Thermora</span>
      <div className="label hidden lg:block">Human or natural? The corrected fire record</div>
    </div>
  )
}

export default function TopBar({ compact = false }: { compact?: boolean }) {
  const setAbout = useUi((s) => s.setAbout)
  const about = (
    <button
      onClick={() => setAbout(true)}
      aria-label="About and methods"
      className="rounded border border-line px-2.5 py-1.5 text-[13px] text-dim hover:text-text"
    >
      Methods
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
