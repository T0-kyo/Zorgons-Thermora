/**
 * OWNER: Agent B. B8/B20 — ~60s guided tour (used for the demo video), incl. Human vs natural steps.
 * It only drives the shared store (region / mode / year); the globe flies on its own.
 * Any click, tap or Esc stops it. Countries are chosen from the data and every caption figure comes
 * from the backend; a step with no data is skipped.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import { fetchSummary, fetchYearTotals } from './data'
import { dataYears } from '../shared/api'
import { fmtHuman, humanLabel, weekendDip } from '../charts/stats'

/** the tour's year: the latest year the backend has */
const tourYear = () => dataYears?.max ?? app().year
type Ctx = { year: number }
interface Step {
  ms: number
  /** may pick its country from the data; returns the caption ('' = skip step) */
  run: (c: Ctx) => Promise<string>
}

const app = () => useApp.getState()
type TourMode = 'legacy' | 'harmonized' | 'human'
const focus = (id: string | null, mode: TourMode) => {
  app().selectRegion(id)
  app().setMode(mode)
}
const pct = (v: number) => `${v.toFixed(0)}%`
const fires = (n: number) => Math.round(n).toLocaleString()

/** Countries ranked by the backend's own numbers for the year (only those with data and a score). */
async function ranked(year: number) {
  const t = await fetchYearTotals(year)
  const rows = Object.entries(t.byRegion)
    .map(([id, v]) => ({ id, name: regionById(id)?.name ?? id, ...v }))
    .filter((r) => r.harmonized > 0)
  const scored = rows.filter((r) => Number.isFinite(r.human))
  const by = <T,>(a: T[], f: (x: T) => number) => [...a].sort((x, y) => f(y) - f(x))
  return {
    totals: t,
    mostHuman: by(scored, (r) => r.human)[0] ?? null,
    mostNatural: by(scored, (r) => -r.human)[0] ?? null,
    biggest: by(rows, (r) => r.harmonized)[0] ?? null,
    widestGap: by(rows, (r) => r.pct)[0] ?? null,
  }
}

/** caption for one country, every figure from the backend */
async function countryCaption(id: string, name: string, year: number, h: number) {
  const s = await fetchSummary(id, year)
  const dip = weekendDip(s.weekdayCounts)
  const rhythm = Math.abs(dip) >= 3 ? ` Fires change ${dip > 0 ? '+' : ''}${dip.toFixed(0)}% at weekends.` : ''
  const st = s.humanStats
  const range = Number.isFinite(st.low) && Number.isFinite(st.high) ? ` (95% range ${st.low.toFixed(2)} to ${st.high.toFixed(2)}${st.confidence ? `, ${st.confidence} confidence` : ''})` : ''
  return `${name}, ${year}: ${humanLabel(h).toLowerCase()}, human likelihood ${fmtHuman(h)}${range}.${rhythm}`
}

const STEPS: Step[] = [
  {
    ms: 6500,
    run: async ({ year }) => {
      focus(null, 'harmonized')
      const t = (await fetchYearTotals(year)).global
      if (!t) return ''
      return `${year}: combining MODIS with VIIRS finds ${fires(t.harmonized)} fires, ${pct(t.pct)} more than MODIS alone (${fires(t.legacy)}).`
    },
  },
  {
    ms: 7000,
    run: async () => {
      focus(null, 'human')
      return 'Human or natural? Magenta areas score as likely human-driven, ice blue as likely natural, grey has no score.'
    },
  },
  {
    ms: 7000,
    run: async ({ year }) => {
      const r = (await ranked(year)).widestGap
      if (!r) return ''
      focus(r.id, 'harmonized')
      return `${r.name}: the legacy record misses the most here, ${pct(r.pct)} (${fires(r.legacy)} MODIS vs ${fires(r.harmonized)} harmonized).`
    },
  },
  {
    ms: 7500,
    run: async ({ year }) => {
      const r = (await ranked(year)).mostHuman
      if (!r) return ''
      const text = await countryCaption(r.id, r.name, year, r.human)
      focus(r.id, 'human') // move the globe and change the caption together
      return text
    },
  },
  {
    ms: 7500,
    run: async ({ year }) => {
      const r = (await ranked(year)).mostNatural
      if (!r) return ''
      const text = await countryCaption(r.id, r.name, year, r.human)
      focus(r.id, 'human') // move the globe and change the caption together
      return text
    },
  },
  {
    ms: 7500,
    run: async ({ year }) => {
      const r = (await ranked(year)).biggest
      if (!r) return ''
      focus(r.id, 'harmonized')
      return `${r.name} has the most fires in ${year}: ${fires(r.harmonized)} in the harmonized record.`
    },
  },
  {
    ms: 7000,
    run: async () => {
      focus(null, 'human')
      return 'Pick a country, or search any place, to explore its fires.'
    },
  },
]

export default function Tour() {
  const touring = useApp((s) => s.touring)
  const [cap, setCap] = useState<{ i: number; text: string } | null>(null)

  // run the script
  useEffect(() => {
    if (!touring) return
    let cancelled = false
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    ;(async () => {
      app().setPlaying(false)
      app().setYear(tourYear())
      for (let i = 0; i < STEPS.length; i++) {
        if (cancelled) return
        const step = STEPS[i]
        let text: string
        try {
          text = await step.run({ year: tourYear() })
        } catch {
          text = '' // no data for this step: skip it rather than show anything made up
        }
        if (cancelled) return
        if (!text) continue
        setCap({ i, text })
        await sleep(step.ms)
      }
      if (!cancelled) app().stopTour()
    })()
    return () => {
      cancelled = true
      setCap(null)
    }
  }, [touring])

  // any interaction stops it (registered after the click that started the tour)
  useEffect(() => {
    if (!touring) return
    const stop = (e?: Event) => {
      // the tour button handles its own click (otherwise stop → click would restart it)
      if (e?.target instanceof Element && e.target.closest('[data-tour-btn]')) return
      app().stopTour()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stop()
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', stop, true)
      window.addEventListener('wheel', stop, { capture: true, passive: true })
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', stop, true)
      window.removeEventListener('wheel', stop, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [touring])

  const region = regionById(useApp((s) => s.regionId))

  return (
    <AnimatePresence>
      {touring && cap && (
        <motion.div
          key={cap.i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="pointer-events-none absolute inset-x-3 top-[34%] z-20 mx-auto max-w-xl md:top-auto md:bottom-24"
        >
          <div className="panel px-4 py-3 text-center">
            <div className="label mb-1 flex justify-between">
              <span>{region ? region.name : 'Global view'}</span>
              <span>
                {cap.i + 1} of {STEPS.length}
              </span>
            </div>
            <p className="text-sm leading-relaxed md:text-base">{cap.text}</p>
            <div className="mt-2 h-0.5 overflow-hidden rounded bg-line">
              <motion.div
                key={cap.i}
                className="h-full bg-cyan"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: STEPS[cap.i].ms / 1000, ease: 'linear' }}
              />
            </div>
            <div className="label mt-1.5">Click anywhere to leave the tour</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
