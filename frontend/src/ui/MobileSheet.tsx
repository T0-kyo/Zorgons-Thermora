/** OWNER: Agent B. B10 — phone bottom sheet: collapsed shows the headline, expanded shows everything. */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import { SpotlightContent } from './SpotlightPanel'
import GlobalOverview from './GlobalOverview'
import { fmtPct, useSummary, useYearTotals } from './data'
import Timeline from './Timeline'

function Peek() {
  const regionId = useApp((s) => s.regionId)
  const year = useApp((s) => s.year)
  const { data } = useSummary(regionId, year)
  const totals = useYearTotals(year)
  const region = regionById(regionId)
  const pct = region ? data?.undercountPct : totals?.global.pct
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <div className="min-w-0">
        <div className="label">{region ? 'Region spotlight' : 'Global view'} · {year}</div>
        <div className="truncate text-sm font-semibold">{region ? region.name : 'How much fire did the record miss?'}</div>
      </div>
      {pct != null && <div className="shrink-0 font-mono text-xl text-missed">+{fmtPct(pct)}</div>}
    </div>
  )
}

export default function MobileSheet() {
  const regionId = useApp((s) => s.regionId)
  const [open, setOpen] = useState(regionId !== null)
  const [prevRegion, setPrevRegion] = useState(regionId)

  // picking a region opens the sheet; going global collapses it so the globe is visible
  if (prevRegion !== regionId) {
    setPrevRegion(regionId)
    setOpen(regionId !== null)
  }

  return (
    <div className="pointer-events-auto space-y-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <Timeline compact />
      <motion.div
        className="panel overflow-hidden rounded-b-none"
        initial={false}
        animate={{ height: open ? '62vh' : 'auto' }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.button
          className="block w-full touch-none px-3 pt-2 pb-2.5 text-left"
          onClick={() => setOpen((o) => !o)}
          onPanEnd={(_, info) => {
            if (info.offset.y < -24) setOpen(true)
            else if (info.offset.y > 24) setOpen(false)
          }}
          aria-expanded={open}
          aria-label={open ? 'Collapse details' : 'Expand details'}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-dim/50" />
          {!open && <Peek />}
        </motion.button>
        {open && (
          <div className="h-[calc(62vh-2.5rem)] overflow-y-auto px-4 pb-6">
            {regionId ? <SpotlightContent regionId={regionId} /> : <GlobalOverview compact />}
          </div>
        )}
      </motion.div>
    </div>
  )
}
