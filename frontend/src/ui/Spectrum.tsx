/**
 * The signature instrument: "Who lit it?"
 * A histogram of this year's fires by area human-likelihood (natural ← → human), with two
 * draggable handles that filter the globe live. Fires outside the band fade to a trace.
 *
 * Keys: N natural · M mixed · U human-driven · A all · H toggles the colouring.
 * Handles are sliders: ←/→ moves 0.05, Shift+←/→ moves 0.1.
 * (Owner: Agent A, editorial refactor. Lives in ui/ because it's a control.)
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../shared/store'
import { useDataStatus } from '../shared/dataStatus'
import { getCells } from '../shared/api'
import type { FireCell } from '../shared/types'

const BINS = 24
const PRESETS: { key: string; label: string; range: [number, number] }[] = [
  { key: 'a', label: 'All fires', range: [0, 1] },
  { key: 'n', label: 'Likely natural', range: [0, 0.4] },
  { key: 'm', label: 'Mixed', range: [0.4, 0.7] },
  { key: 'u', label: 'Likely human', range: [0.7, 1] },
]

// natural (ice) → human (magenta), same ramp as the globe
const ICE = [143, 211, 232], HOT = [255, 61, 129]
const ramp = (t: number) => {
  const k = Math.min(1, Math.max(0, (t - 0.25) / 0.6))
  return `rgb(${ICE.map((v, i) => Math.round(v + (HOT[i] - v) * k)).join(',')})`
}

function useYearCells(year: number) {
  const [cells, setCells] = useState<FireCell[]>([])
  const up = useDataStatus((st) => st.backend === 'up')
  useEffect(() => {
    let live = true
    getCells(year).then((c) => live && setCells(c)).catch(() => {})
    return () => { live = false }
  }, [year, up])
  return cells
}

export default function Spectrum({ compact = false }: { compact?: boolean }) {
  const year = useApp((s) => s.year)
  const regionId = useApp((s) => s.regionId)
  const mode = useApp((s) => s.mode)
  const range = useApp((s) => s.humanRange)
  const setRange = useApp((s) => s.setHumanRange)
  const setMode = useApp((s) => s.setMode)
  const cells = useYearCells(year)
  const cellsFailed = useDataStatus((st) => st.sources.cells === 'error')
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<0 | 1 | null>(null)

  const pool = useMemo(() => (regionId ? cells.filter((c) => c.regionId === regionId) : cells), [cells, regionId])
  const { bins, max, total, inBand, unscored } = useMemo(() => {
    const b = new Array(BINS).fill(0)
    let tot = 0, band = 0
    let unscored = 0
    const all = range[0] <= 0 && range[1] >= 1
    for (const c of pool) {
      tot += c.harmonized
      if (c.human < 0) { unscored += c.harmonized; if (all) band += c.harmonized; continue } // no score: not binned
      b[Math.min(BINS - 1, Math.floor(c.human * BINS))] += c.harmonized
      if (c.human >= range[0] && c.human <= range[1]) band += c.harmonized
    }
    return { bins: b, max: Math.max(1, ...b), total: tot, inBand: band, unscored }
  }, [pool, range])

  const engage = (r: [number, number]) => {
    if (mode !== 'human') setMode('human')
    setRange(r)
  }

  // keyboard presets (ignored while typing in an input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return
      const p = PRESETS.find((x) => x.key === e.key.toLowerCase())
      if (p) engage(p.range)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const valueAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100) / 100
  }
  const onDown = (e: React.PointerEvent) => {
    const v = valueAt(e.clientX)
    const which: 0 | 1 = Math.abs(v - range[0]) <= Math.abs(v - range[1]) ? 0 : 1
    drag.current = which
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const next: [number, number] = which === 0 ? [Math.min(v, range[1]), range[1]] : [range[0], Math.max(v, range[0])]
    engage(next)
  }
  const onMove = (e: React.PointerEvent) => {
    if (drag.current === null) return
    const v = valueAt(e.clientX)
    engage(drag.current === 0 ? [Math.min(v, range[1]), range[1]] : [range[0], Math.max(v, range[0])])
  }
  const onUp = () => { drag.current = null }

  const onHandleKey = (which: 0 | 1) => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.05
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : 0
    if (!d) return
    e.preventDefault()
    const v = Math.round((range[which] + d) * 100) / 100
    engage(which === 0 ? [Math.min(Math.max(0, v), range[1]), range[1]] : [range[0], Math.max(Math.min(1, v), range[0])])
  }

  const share = total ? Math.round((inBand / total) * 100) : 0
  const h = compact ? 34 : 56
  const off = mode !== 'human'

  return (
    <section aria-label="Human or natural filter" className={`select-none ${off ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          {cellsFailed ? (
            <span className="text-[13px] text-warn">Fire data for {year} is unavailable: the backend did not answer.</span>
          ) : (
            <>
              <span className="spectrum-count readout text-text" style={{ fontSize: compact ? 18 : 26 }}>
                {inBand.toLocaleString()}
              </span>
              <span className="text-[13px] text-dim">
                fires in this band, {share}% of {regionId ? 'the country' : 'the world'} in {year}
                {unscored > 0 && `, ${Math.round((unscored / total) * 100)}% have no score`}
              </span>
            </>
          )}
        </div>
        {!compact && (
          <div className="flex gap-4 text-[13px]">
            {PRESETS.map((p) => {
              const on = !off && range[0] === p.range[0] && range[1] === p.range[1]
              return (
                <button
                  key={p.key}
                  onClick={() => engage(p.range)}
                  title={`Shortcut: ${p.key.toUpperCase()}`}
                  className={`spectrum-preset ${on ? 'is-on' : ''}`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div
        ref={track}
        className="relative mt-8 cursor-ew-resize touch-none"
        style={{ height: h }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* histogram */}
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${BINS} 100`} preserveAspectRatio="none" aria-hidden>
          {bins.map((v, i) => {
            const c = (i + 0.5) / BINS
            const lit = !off && c >= range[0] && c <= range[1]
            const bh = Math.max(1.5, (v / max) * 96)
            return <rect key={i} x={i + 0.12} y={100 - bh} width={0.76} height={bh} fill={ramp(c)} opacity={lit ? 0.95 : 0.16} />
          })}
        </svg>
        {/* baseline + quartile ticks */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-line" />
        {[0.25, 0.5, 0.75].map((t) => (
          <div key={t} className="absolute bottom-0 h-2 w-px bg-line" style={{ left: `${t * 100}%` }} />
        ))}
        {/* handles */}
        {([0, 1] as const).map((w) => (
          <div
            key={w}
            role="slider"
            tabIndex={0}
            aria-label={w === 0 ? 'Lower human likelihood' : 'Upper human likelihood'}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={range[w]}
            aria-valuetext={range[w].toFixed(2)}
            onKeyDown={onHandleKey(w)}
            className="spectrum-handle"
            style={{ left: `${range[w] * 100}%` }}
          >
            <span
              className="spectrum-handle-tab"
              style={{ transform: range[w] < 0.06 ? 'translateX(-1px)' : range[w] > 0.94 ? 'translateX(calc(-100% + 1px))' : 'translateX(-50%)', left: range[w] < 0.06 || range[w] > 0.94 ? 0 : '50%' }}
            >
              {range[w].toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex justify-between text-[12.5px]">
        <span style={{ color: ramp(0) }}>Likely natural</span>
        {!compact && <span className="text-dim">Average human score for each area, never a verdict on one fire.</span>}
        <span style={{ color: ramp(1) }}>Likely human-driven</span>
      </div>
    </section>
  )
}
