/**
 * OWNER: Agent B. B17 — calendar: pick a day. B18 — compare up to 3 days.
 * Month grid (Mon-first), each day shaded by fires (fire ramp; follows the Legacy/Harmonized toggle),
 * month + year navigation (year is the app year), arrow keys move between days, Enter selects.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../shared/store'
import type { DailyPoint, Target } from '../shared/types'
import { YEARS } from '../shared/types'
import { humanLabel } from '../charts/stats'
import { fmtInt, fmtSigned, useDaily, useDay } from './data'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const parse = (iso: string) => ({ y: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1, d: +iso.slice(8, 10) })
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
const weekdayOf = (iso: string) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7 // Mon = 0
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const longDate = (iso: string) => {
  const { y, m, d } = parse(iso)
  return `${WD_LONG[weekdayOf(iso)]} ${d} ${MONTHS[m]} ${y}`
}
const shortDate = (iso: string) => {
  const { y, m, d } = parse(iso)
  return `${d} ${MONTHS[m].slice(0, 3)} ${y}`
}
function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${s}`
}

/** Fire ramp for a 0–1 intensity (sqrt so quiet days still read). */
const shade = (t: number) => (t <= 0 ? 'transparent' : `color-mix(in oklab, var(--color-fire) ${Math.round(8 + Math.sqrt(t) * 82)}%, transparent)`)

function busiestMonth(daily: DailyPoint[]) {
  const sums = new Array(12).fill(0)
  for (const d of daily) sums[parse(d.date).m] += d.harmonized
  return sums.indexOf(Math.max(...sums))
}

// ---- day card (B17) + compare action (B18) ------------------------------------------
function DayCard({ target, date }: { target: Target; date: string }) {
  const { data: d, loading } = useDay(target, date)
  const compareDates = useApp((s) => s.compareDates)
  const toggleCompare = useApp((s) => s.toggleCompare)
  const setDate = useApp((s) => s.setDate)
  const mode = useApp((s) => s.mode)
  const pinned = compareDates.includes(date)

  return (
    <motion.div
      key={date}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-3 rounded border border-line bg-white/[0.02] p-3"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px]">{longDate(date)}</div>
          {d && (
            <span className={`mt-0.5 inline-block rounded border px-1.5 text-[11.5px] ${d.isWeekend ? 'border-warn/50 text-warn' : 'border-line text-dim'}`}>
              {d.isWeekend ? 'Weekend' : 'Weekday'}
            </span>
          )}
        </div>
        <button onClick={() => setDate(null)} aria-label="Close day" className="rounded px-1.5 text-dim hover:bg-white/5 hover:text-text">
          ✕
        </button>
      </div>

      {loading || !d ? (
        <div className="mt-3 h-24 animate-pulse rounded bg-line" />
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="label">Fires, corrected record</div>
              <div className={`readout text-[30px] ${mode === 'legacy' ? 'text-cyan/60' : 'text-cyan'}`}>{fmtInt(d.firesHarmonized)}</div>
            </div>
            <div>
              <div className="label">Legacy record</div>
              <div className={`readout text-[30px] ${mode === 'legacy' ? 'text-fire' : 'text-fire/60'}`}>{fmtInt(d.firesLegacy)}</div>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
            <div>
              <dt className="label">vs the year’s daily average</dt>
              <dd className={`font-mono ${d.vsYearAvgPct >= 0 ? 'text-fire' : 'text-ok'}`}>{fmtSigned(d.vsYearAvgPct)}</dd>
            </div>
            <div>
              <dt className="label">vs an average {WD_LONG[d.weekday]}</dt>
              <dd className={`font-mono ${d.vsWeekdayAvgPct >= 0 ? 'text-fire' : 'text-ok'}`}>{fmtSigned(d.vsWeekdayAvgPct)}</dd>
            </div>
            <div>
              <dt className="label">Rank in the year</dt>
              <dd>
                {ordinal(d.rankInYear)} busiest day of {parse(date).y}
              </dd>
            </div>
            <div>
              <dt className="label">Human likelihood, area</dt>
              <dd>
                <span className="font-mono text-missed">{d.humanLikelihood.toFixed(2)}</span>{' '}
                <span className="text-dim">{humanLabel(d.humanLikelihood)}</span>
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => toggleCompare(date)}
              aria-pressed={pinned}
              className={`rounded border px-3 py-1 text-[13px] transition-colors ${pinned ? 'border-cyan/60 bg-cyan/15 text-cyan' : 'border-cyan/40 text-cyan hover:bg-cyan/10'}`}
            >
              {pinned ? 'Remove from compare' : 'Compare'}
            </button>
            {!pinned && compareDates.length >= 3 && <span className="text-[12px] text-dim">Up to 3 days: the oldest pin will drop.</span>}
          </div>
        </>
      )}
    </motion.div>
  )
}

// ---- compare tray (B18) ----------------------------------------------------------------
function CompareColumn({ target, date }: { target: Target; date: string }) {
  const { data: d } = useDay(target, date)
  const toggleCompare = useApp((s) => s.toggleCompare)
  const setDate = useApp((s) => s.setDate)
  const active = useApp((s) => s.date === date)
  return (
    <div className={`min-w-0 rounded border p-2 ${active ? 'border-cyan/50' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-1">
        <button onClick={() => setDate(date)} className="min-w-0 text-left text-[13px] leading-tight hover:text-cyan" title="Open this day">
          {shortDate(date)}
        </button>
        <button onClick={() => toggleCompare(date)} aria-label={`Unpin ${shortDate(date)}`} className="text-[12px] text-dim hover:text-text">
          ✕
        </button>
      </div>
      {d ? (
        <div className="mt-1 space-y-1">
          <div className={`text-[12px] ${d.isWeekend ? 'text-warn' : 'text-dim'}`}>
            {WD[d.weekday]}
            {d.isWeekend ? ', weekend' : ''}
          </div>
          <div className="readout text-[22px] text-cyan">{fmtInt(d.firesHarmonized)}</div>
          <div className="text-[11.5px] text-dim">
            legacy <span className="font-mono text-fire">{fmtInt(d.firesLegacy)}</span>
          </div>
          <div className="text-[12px]">
            <span className={`font-mono ${d.vsYearAvgPct >= 0 ? 'text-fire' : 'text-ok'}`}>{fmtSigned(d.vsYearAvgPct)}</span>{' '}
            <span className="text-dim">vs year</span>
          </div>
          <div className="text-[12px]">
            <span className={`font-mono ${d.vsWeekdayAvgPct >= 0 ? 'text-fire' : 'text-ok'}`}>{fmtSigned(d.vsWeekdayAvgPct)}</span>{' '}
            <span className="text-dim">vs avg {WD[d.weekday]}</span>
          </div>
        </div>
      ) : (
        <div className="mt-2 h-16 animate-pulse rounded bg-line" />
      )}
    </div>
  )
}

function CompareTray({ target }: { target: Target }) {
  const compareDates = useApp((s) => s.compareDates)
  const clearCompare = useApp((s) => s.clearCompare)
  if (compareDates.length === 0) return null
  const sorted = [...compareDates].sort()
  return (
    <section className="mt-4 border-t border-line pt-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[15px]">Compare days</h3>
        <button onClick={clearCompare} className="text-[13px] text-dim hover:text-text">
          Clear
        </button>
      </div>
      <div className={`grid gap-2 ${sorted.length === 1 ? 'grid-cols-1' : sorted.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {sorted.map((d) => (
          <CompareColumn key={d} target={target} date={d} />
        ))}
      </div>
      {sorted.length === 1 && <p className="mt-2 text-[12px] text-dim">Pin another day to compare, for example a weekend against a weekday.</p>}
    </section>
  )
}

// ---- calendar grid (B17) --------------------------------------------------------------
export default function CalendarView({ target }: { target: Target }) {
  const year = useApp((s) => s.year)
  const date = useApp((s) => s.date)
  const mode = useApp((s) => s.mode)
  const setYear = useApp((s) => s.setYear)
  const setDate = useApp((s) => s.setDate)
  const setPlaying = useApp((s) => s.setPlaying)
  const { data: daily, loading } = useDaily(target, year)
  const [monthPick, setMonthPick] = useState<{ y: number; m: number } | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const grid = useRef<HTMLDivElement>(null)

  // which month: the user's pick (if for this year), else the selected day's, else the busiest month
  const dateHere = date && parse(date).y === year ? parse(date).m : null
  const month = monthPick?.y === year ? monthPick.m : (dateHere ?? (daily ? busiestMonth(daily) : 0))

  const byDate = useMemo(() => new Map((daily ?? []).map((d) => [d.date, d])), [daily])
  const max = useMemo(() => Math.max(1, ...(daily ?? []).map((d) => (mode === 'legacy' ? d.legacy : d.harmonized))), [daily, mode])

  const goMonth = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 0) [m, y] = [11, y - 1]
    if (m > 11) [m, y] = [0, y + 1]
    if (y < YEARS.min || y > YEARS.max) return
    setPlaying(false)
    if (y !== year) setYear(y)
    setMonthPick({ y, m })
  }

  // keep keyboard focus on the focused day after month/year changes
  useEffect(() => {
    if (!focus) return
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus()
  }, [focus, month, year, daily])

  const first = isoOf(year, month, 1)
  const offset = weekdayOf(first)
  const n = daysIn(year, month)
  const tabDay = focus && parse(focus).y === year && parse(focus).m === month ? focus : date && parse(date).y === year && parse(date).m === month ? date : first

  const moveFocus = (from: string, delta: number) => {
    const to = addDays(from, delta)
    const p = parse(to)
    if (p.y < YEARS.min || p.y > YEARS.max) return
    setPlaying(false)
    if (p.y !== year) setYear(p.y)
    setMonthPick({ y: p.y, m: p.m })
    setFocus(to)
  }
  const onKey = (e: React.KeyboardEvent, iso: string) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (step) {
      e.preventDefault()
      moveFocus(iso, step)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setDate(iso)
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      goMonth(e.key === 'PageUp' ? -1 : 1)
    }
  }

  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: n }, (_, i) => isoOf(year, month, i + 1))]

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <button onClick={() => goMonth(-1)} aria-label="Previous month" className="rounded border border-line px-2 py-0.5 text-dim hover:text-text">
          ‹
        </button>
        <div className="flex-1 text-center text-[15px]" aria-live="polite">
          {MONTHS[month]}
        </div>
        <select
          value={year}
          onChange={(e) => {
            setPlaying(false)
            setYear(+e.target.value)
          }}
          aria-label="Year"
          className="rounded border border-line bg-ink px-1.5 py-0.5 text-[13px] text-text"
        >
          {Array.from({ length: YEARS.max - YEARS.min + 1 }, (_, i) => YEARS.min + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button onClick={() => goMonth(1)} aria-label="Next month" className="rounded border border-line px-2 py-0.5 text-dim hover:text-text">
          ›
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {WD.map((w, i) => (
          <div key={w} className={`label ${i >= 5 ? 'text-warn/80' : ''}`}>
            {w}
          </div>
        ))}
      </div>
      <div ref={grid} role="grid" aria-label={`${MONTHS[month]} ${year}, fires per day`} className={`mt-1 grid grid-cols-7 gap-1 ${loading ? 'animate-pulse' : ''}`}>
        {cells.map((iso, i) => {
          if (!iso) return <div key={`b${i}`} />
          const p = byDate.get(iso)
          const v = p ? (mode === 'legacy' ? p.legacy : p.harmonized) : 0
          const t = v / max
          const selected = iso === date
          return (
            <button
              key={iso}
              data-date={iso}
              role="gridcell"
              aria-selected={selected}
              tabIndex={iso === tabDay ? 0 : -1}
              onClick={() => {
                setFocus(iso)
                setDate(iso)
              }}
              onKeyDown={(e) => onKey(e, iso)}
              onFocus={() => setFocus(iso)}
              aria-label={`${longDate(iso)}, ${p ? fmtInt(v) : 'no data'} fires`}
              title={p ? `${shortDate(iso)}: ${fmtInt(v)} fires` : shortDate(iso)}
              className={`relative aspect-square rounded-sm border text-[12px] transition-colors ${
                selected ? 'border-text' : 'border-transparent hover:border-text/40'
              } ${t > 0.55 ? 'text-ink' : 'text-text/85'}`}
              style={{ background: shade(t) }}
            >
              {parse(iso).d}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex items-center gap-2 text-[12px] text-dim">
        <span>Fewer fires</span>
        <span className="h-1.5 flex-1 rounded-sm" style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--color-fire) 8%, transparent), var(--color-fire))' }} />
        <span>More fires</span>
      </div>
      <p className="mt-1 text-[12px] text-dim">
        Shaded by the harmonized record (MODIS + VIIRS). Arrow keys move, Enter picks a day.
      </p>

      <AnimatePresence initial={false}>{date && <DayCard key={date} target={target} date={date} />}</AnimatePresence>
      <CompareTray target={target} />
    </div>
  )
}
