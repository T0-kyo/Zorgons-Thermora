/**
 * OWNER: Agent B. Desktop right-hand panel (B3/B15): place search on top, then the global
 * overview, or the region/place panel with its Progress and Calendar views.
 * RegionFindings keeps the original three answers (undercount, weekly rhythm, trend) for the
 * region, as a collapsible section inside the Progress view.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import HumanGauge from '../charts/HumanGauge'
import WeeklyChart from '../charts/WeeklyChart'
import TrendChart from '../charts/TrendChart'
import CountUp from './CountUp'
import { fmtPct, useSummary } from './data'
import { HeroCount, RecordBar, Section, HumanHero, HumanEvidence } from './RecordBar'
import GlobalOverview from './GlobalOverview'
import PlaceSearch from './PlaceSearch'
import TargetPanel from './TargetPanel'
import { useTarget } from './useTarget'
import { targetKey } from './data'

export function RegionFindings({ regionId, isPlace }: { regionId: string; isPlace: boolean }) {
  const year = useApp((s) => s.year)
  const mode = useApp((s) => s.mode)
  const { data: s, error } = useSummary(regionId, year)
  const [open, setOpen] = useState(!isPlace)
  const region = regionById(regionId)
  if (!region) return null

  return (
    <section className="border-t border-line pt-3">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-baseline justify-between gap-3 text-left">
        <span>
          <span className="block text-[15px]">{isPlace ? `About the whole country` : 'Country findings'}</span>
          <span className="label">
            {region.name}, {year}
          </span>
        </span>
        <span className="flex items-baseline gap-2">
          {s && (
            <span className="text-[12.5px] text-dim">
              Undercount <span className="font-mono text-missed">+{fmtPct(s.undercountPct, 0)}</span>
            </span>
          )}
          <span className={`text-dim transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
            ▾
          </span>
        </span>
      </button>
      {error && <p className="mt-2 text-sm text-warn">Region data is unavailable right now.</p>}
      {open && s && (
        <div className="mt-3 space-y-3">
          <Section q="Q1" title="How much did the legacy record miss?">
            <div className="flex items-end justify-between gap-3">
              <HeroCount legacy={s.firesLegacy} harmonized={s.firesHarmonized} mode={mode} />
              <div className="text-right">
                <div className="label">Undercount</div>
                <CountUp value={s.undercountPct} format={(v) => `+${v.toFixed(1)}%`} className="readout block text-[30px] text-missed" />
                {s.undercountCi[0] !== s.undercountCi[1] && (
                  <div className="text-[12px] text-dim">
                  range <span className="font-mono">{s.undercountCi[0]}</span> to <span className="font-mono">{s.undercountCi[1]}%</span>
                </div>
                )}
              </div>
            </div>
            <div className="mt-3">
              <RecordBar legacy={s.firesLegacy} harmonized={s.firesHarmonized} mode={mode} />
            </div>
          </Section>
          <Section q="Q2" title="Human or natural?">
            {Number.isFinite(s.humanScore.legacy) ? (
              <>
                <HumanGauge legacy={s.humanScore.legacy} harmonized={s.humanScore.harmonized} mode={mode} />
                <HumanEvidence stats={s.humanStats} period={String(year)} />
              </>
            ) : (
              <HumanHero value={s.humanScore.harmonized} stats={s.humanStats} period={String(year)} size="text-[34px]" />
            )}
            <div className="mt-3">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="label">Weekly rhythm</span>
                <span className="label">detections vs the weekly mean</span>
              </div>
              <WeeklyChart counts={s.weekdayCounts} />
            </div>
          </Section>
          {s.trend.length > 1 && (
            <Section q="Q3" title="Does the trend hold after correction?">
              <TrendChart trend={s.trend} year={year} mode={mode} survives={s.trendSurvives} verdict={s.verdict} />
            </Section>
          )}
        </div>
      )}
    </section>
  )
}

/** Panel body shared by desktop and the phone sheet. */
export function PanelBody({ compact = false }: { compact?: boolean }) {
  const target = useTarget()
  return (
    <div className="space-y-3">
      <PlaceSearch />
      {target ? <TargetPanel target={target} /> : <GlobalOverview compact={compact} />}
    </div>
  )
}

/**
 * Desktop right-hand panel. The new content slides in at once (no waiting for an exit
 * animation): during a camera fly-to a weak GPU can stall animations, and the panel must
 * never disappear for the length of the flight.
 */
export default function SpotlightPanel() {
  const target = useTarget()
  const key = target ? targetKey(target) : 'global'
  return (
    <motion.aside
      key={key}
      initial={{ opacity: 0.4, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="panel pointer-events-auto max-h-full w-[380px] shrink-0 overflow-y-auto p-4 [scrollbar-width:thin]"
    >
      <PanelBody />
    </motion.aside>
  )
}
