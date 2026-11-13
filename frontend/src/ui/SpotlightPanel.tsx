/** OWNER: Agent B. B3 — region spotlight: undercount, counts, and the three answers (B4–B6). */
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import HumanGauge from '../charts/HumanGauge'
import WeeklyChart from '../charts/WeeklyChart'
import TrendChart from '../charts/TrendChart'
import CountUp from './CountUp'
import { useSummary } from './data'
import { HeroCount, RecordBar, Section } from './RecordBar'
import GlobalOverview from './GlobalOverview'

function Skeleton() {
  return (
    <div className="mt-4 animate-pulse space-y-3">
      <div className="h-8 w-2/3 rounded bg-line" />
      <div className="h-2.5 rounded bg-line" />
      <div className="h-28 rounded bg-line" />
      <div className="h-28 rounded bg-line" />
    </div>
  )
}

export function SpotlightContent({ regionId }: { regionId: string }) {
  const year = useApp((s) => s.year)
  const mode = useApp((s) => s.mode)
  const selectRegion = useApp((s) => s.selectRegion)
  const stopTour = useApp((s) => s.stopTour)
  const region = regionById(regionId)
  const { data: s, error } = useSummary(regionId, year)
  if (!region) return null

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="label">Region spotlight · {year}</div>
          <h2 className="mt-0.5 text-lg leading-tight font-semibold">{region.name}</h2>
          <p className="text-xs text-dim">{region.blurb}</p>
        </div>
        <button
          onClick={() => {
            stopTour()
            selectRegion(null)
          }}
          aria-label="Back to global view"
          className="rounded px-1.5 text-dim hover:bg-white/5 hover:text-text"
        >
          ✕
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-warn">Data for this region is unavailable right now.</p>}
      {!s && !error && <Skeleton />}
      {s && (
        <div className="mt-3 space-y-3">
          <Section q="Q1" title="How much did the legacy record miss?">
            <div className="flex items-end justify-between gap-3">
              <HeroCount legacy={s.firesLegacy} harmonized={s.firesHarmonized} mode={mode} />
              <div className="text-right">
                <div className="label">undercount</div>
                <CountUp value={s.undercountPct} format={(v) => `+${v.toFixed(1)}%`} className="block font-mono text-3xl text-missed tabular-nums" />
                <div className="font-mono text-[10px] text-dim">
                  CI {s.undercountCi[0]}–{s.undercountCi[1]}%
                </div>
              </div>
            </div>
            <div className="mt-3">
              <RecordBar legacy={s.firesLegacy} harmonized={s.firesHarmonized} mode={mode} />
            </div>
          </Section>

          <Section q="Q2" title="Is the fire human-driven?">
            <HumanGauge legacy={s.humanScore.legacy} harmonized={s.humanScore.harmonized} mode={mode} />
            <div className="mt-3">
              <div className="label mb-1">Weekly cycle · detections vs weekly mean</div>
              <WeeklyChart counts={s.weekdayCounts} />
            </div>
          </Section>

          <Section q="Q3" title="Does the trend hold after correction?">
            <TrendChart trend={s.trend} year={year} mode={mode} survives={s.trendSurvives} verdict={s.verdict} />
          </Section>
        </div>
      )}
    </div>
  )
}

/** Desktop right-hand panel: global overview, or the spotlight for the selected region. */
export default function SpotlightPanel() {
  const regionId = useApp((s) => s.regionId)
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.aside
        key={regionId ?? 'global'}
        initial={{ opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 32 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="panel pointer-events-auto max-h-full w-[360px] shrink-0 overflow-y-auto p-4 [scrollbar-width:thin]"
      >
        {regionId ? <SpotlightContent regionId={regionId} /> : <GlobalOverview />}
      </motion.aside>
    </AnimatePresence>
  )
}
