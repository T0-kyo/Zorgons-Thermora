/** OWNER: Agent B. B10 — phone bottom sheet: collapsed shows the headline, expanded shows everything. */
import { fmtHuman } from '../charts/stats'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import { PanelBody } from './SpotlightPanel'
import { fmtPct, useProgress, useYearTotals, targetKey } from './data'
import { useTarget } from './useTarget'
import Timeline from './Timeline'

function Peek() {
  const target = useTarget()
  const year = useApp((s) => s.year)
  const mode = useApp((s) => s.mode)
  const totals = useYearTotals(year)
  const { data: p } = useProgress(target)
  const human = mode === 'human'
  const title = target ? (target.kind === 'place' ? target.place.name : (regionById(target.regionId)?.name ?? '')) : human ? 'Human or natural?' : 'How much fire did the record miss?'
  const value = target
    ? p && p.covered
      ? human
        ? fmtHuman(p.humanLikelihood.harmonized)
        : `${p.changePct >= 0 ? '+' : '−'}${Math.abs(p.changePct).toFixed(0)}%`
      : null
    : totals?.global
      ? human
        ? fmtHuman(totals.global.human)
        : `+${fmtPct(totals.global.pct)}`
      : null
  const caption = target ? (human ? 'Human likelihood' : 'Since 2001') : human ? 'Human likelihood' : 'Undercount'
  return (
    <div className="flex items-end justify-between gap-2 px-1">
      <div className="min-w-0">
        <div className="label">{target ? (target.kind === 'place' ? 'Place' : 'Region') : 'Global view'}</div>
        <div className="truncate text-[15px]">{title}</div>
      </div>
      {value && (
        <div className="shrink-0 text-right">
          <div className="readout text-[24px] text-missed">{value}</div>
          <div className="label">
            {caption}, {year}
          </div>
        </div>
      )}
    </div>
  )
}

export default function MobileSheet() {
  const target = useTarget()
  const key = target ? targetKey(target) : null
  const [open, setOpen] = useState(key !== null)
  const [prevKey, setPrevKey] = useState(key)

  // picking a region or place opens the sheet; going global collapses it so the globe is visible
  if (prevKey !== key) {
    setPrevKey(key)
    setOpen(key !== null)
  }

  return (
    <div className="pointer-events-auto space-y-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* legend replaced by the Spectrum instrument above the sheet */}
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
            <PanelBody compact />
          </div>
        )}
      </motion.div>
    </div>
  )
}
