/**
 * OWNER: Agent B. B8 — ~60s guided tour (used for the demo video).
 * It only drives the shared store (region / mode / year); the globe flies on its own.
 * Any click, tap or Esc stops it. Captions pull live numbers from api.ts.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import { fetchSummary, fetchYearTotals } from './data'
import { weekendDip } from '../charts/stats'

const TOUR_YEAR = 2019
type Ctx = { year: number }
interface Step {
  ms: number
  go?: () => void
  text: string | ((c: Ctx) => Promise<string>)
}

const app = () => useApp.getState()
const focus = (id: string | null, mode: 'legacy' | 'harmonized' | 'difference') => () => {
  app().selectRegion(id)
  app().setMode(mode)
}
const pct = (v: number) => `${v.toFixed(0)}%`

const STEPS: Step[] = [
  {
    ms: 6500,
    go: focus(null, 'legacy'),
    text: 'Since 2000, NASA’s MODIS satellites have built the world’s long-term fire record. This is what it shows.',
  },
  {
    ms: 6500,
    go: focus(null, 'harmonized'),
    text: async ({ year }) => {
      const t = await fetchYearTotals(year)
      return `Harmonized with VIIRS, which sees small fires MODIS cannot, the record grows by ${pct(t.global.pct)}.`
    },
  },
  {
    ms: 5500,
    go: focus(null, 'difference'),
    text: 'In magenta: fires that the legacy record never counted.',
  },
  {
    ms: 7000,
    go: focus('india_china', 'difference'),
    text: async ({ year }) => {
      const s = await fetchSummary('india_china', year)
      return `India & China crop belts: crop-residue burning means small fires. The legacy record undercounts them by ${pct(s.undercountPct)}.`
    },
  },
  {
    ms: 7000,
    go: focus('india_china', 'harmonized'),
    text: async ({ year }) => {
      const s = await fetchSummary('india_china', year)
      const dip = weekendDip(s.weekdayCounts)
      const rhythm = dip < -3 ? `yet these fires drop ${Math.abs(dip).toFixed(0)}% at weekends` : 'and here the weekly rhythm is weak'
      return `Nature has no weekends, ${rhythm}. Human-influence score: ${s.humanScore.harmonized.toFixed(2)}.`
    },
  },
  {
    ms: 7000,
    go: focus('boreal_na', 'harmonized'),
    text: async ({ year }) => {
      const s = await fetchSummary('boreal_na', year)
      const dip = weekendDip(s.weekdayCounts)
      const rhythm = Math.abs(dip) < 3 ? 'barely any weekly rhythm' : `a ${Math.abs(dip).toFixed(0)}% weekend change`
      return `Boreal North America: remote forest fires, mostly lightning. Undercount ${pct(s.undercountPct)}, and ${rhythm}.`
    },
  },
  {
    ms: 8000,
    go: focus('africa', 'harmonized'),
    text: async ({ year }) => {
      const s = await fetchSummary('africa', year)
      const trend = s.trendSurvives ? 'Its long-term trend survives the correction.' : 'Its long-term trend changes once corrected.'
      return `Sub-Saharan Africa burns more than anywhere else, and the legacy record undercounts it by ${pct(s.undercountPct)}. ${trend}`
    },
  },
  {
    ms: 8000,
    go: focus(null, 'difference'),
    text: 'The historical fire record systematically undercounts small fires. Thermora shows where, by how much, and what it means.',
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
              <span>Guided tour {region ? `· ${region.name}` : '· Global'}</span>
              <span>
                {cap.i + 1}/{STEPS.length}
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
            <div className="label mt-1.5">click anywhere to exit</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
