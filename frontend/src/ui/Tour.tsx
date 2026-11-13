/**
 * OWNER: Agent B. B8/B20 — ~60s guided tour (used for the demo video), incl. Human vs natural steps.
 * It only drives the shared store (region / mode / year); the globe flies on its own.
 * Any click, tap or Esc stops it. Captions pull live numbers from api.ts.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import { fetchSummary, fetchYearTotals } from './data'
import { humanLabel, weekendDip } from '../charts/stats'

const TOUR_YEAR = 2019
type Ctx = { year: number }
interface Step {
  ms: number
  go?: () => void
  text: string | ((c: Ctx) => Promise<string>)
}

const app = () => useApp.getState()
type TourMode = 'legacy' | 'harmonized' | 'human'
const focus = (id: string | null, mode: TourMode) => () => {
  app().selectRegion(id)
  app().setMode(mode)
}
const pct = (v: number) => `${v.toFixed(0)}%`
/** Area likelihoods come from the same source as the panels (cells weighted by fires). */
const likelihood = async (year: number, id: string) => (await fetchYearTotals(year)).byRegion[id]?.human ?? 0

const STEPS: Step[] = [
  {
    ms: 6500,
    go: focus(null, 'harmonized'),
    text: async ({ year }) => {
      const t = await fetchYearTotals(year)
      return `Harmonized with VIIRS, which sees small fires MODIS cannot, the record grows by ${pct(t.global.pct)}.`
    },
  },
  {
    ms: 7000,
    go: focus(null, 'human'),
    text: 'Now: human or natural? Magenta areas are likely human-driven, ice blue likely natural. Nature has no weekends; people do.',
  },
  {
    ms: 6500,
    go: focus('india_china', 'harmonized'),
    text: async ({ year }) => {
      const s = await fetchSummary('india_china', year)
      return `India & China crop belts: small fires from crop residue. The legacy record undercounts them by ${pct(s.undercountPct)}.`
    },
  },
  {
    ms: 7500,
    go: focus('india_china', 'human'),
    text: async ({ year }) => {
      const [s, h] = await Promise.all([fetchSummary('india_china', year), likelihood(year, 'india_china')])
      const dip = weekendDip(s.weekdayCounts)
      if (h >= 0.66 && dip < -3)
        return `Crop-residue burning: a strong human rhythm. Fires drop ${Math.abs(dip).toFixed(0)}% at weekends. Human likelihood ${h.toFixed(2)}.`
      return `Crop-residue burning: ${humanLabel(h).toLowerCase()}, with a human likelihood of ${h.toFixed(2)}.`
    },
  },
  {
    ms: 7500,
    go: focus('boreal_na', 'human'),
    text: async ({ year }) => {
      const [s, h] = await Promise.all([fetchSummary('boreal_na', year), likelihood(year, 'boreal_na')])
      const dip = weekendDip(s.weekdayCounts)
      const rhythm = Math.abs(dip) < 3 ? 'and barely any weekly rhythm' : `with a ${Math.abs(dip).toFixed(0)}% weekend change`
      if (h < 0.4) return `Boreal North America. Lightning fires: mostly natural. Human likelihood ${h.toFixed(2)}, ${rhythm}.`
      return `Boreal North America: ${humanLabel(h).toLowerCase()}, human likelihood ${h.toFixed(2)}, ${rhythm}.`
    },
  },
  {
    ms: 7500,
    go: focus('africa', 'harmonized'),
    text: async ({ year }) => {
      const s = await fetchSummary('africa', year)
      const trend = s.trendSurvives ? 'Its long-term trend holds after correction.' : 'Its long-term trend changes once corrected.'
      return `Sub-Saharan Africa burns more than anywhere else, and the legacy record undercounts it by ${pct(s.undercountPct)}. ${trend}`
    },
  },
  {
    ms: 8000,
    go: focus(null, 'human'),
    text: 'The corrected record counts the small fires the old one missed, and shows where fire is likely human-driven or natural. Search any place to explore.',
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
      app().setYear(TOUR_YEAR)
      for (let i = 0; i < STEPS.length; i++) {
        if (cancelled) return
        const step = STEPS[i]
        step.go?.()
        let text: string
        try {
          text = typeof step.text === 'string' ? step.text : await step.text({ year: TOUR_YEAR })
        } catch {
          text = ''
        }
        if (cancelled) return
        if (text) setCap({ i, text })
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
