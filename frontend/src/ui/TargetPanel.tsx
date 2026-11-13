/**
 * OWNER: Agent B. B15 — panel for the current target (picked place, else region):
 * header + "Progress" / "Calendar" switch.
 */
import { motion } from 'framer-motion'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import type { Target } from '../shared/types'
import { useUi, type PanelView } from './uiStore'
import { PlaceChip } from './PlaceSearch'
import ProgressView, { OutsideNotice } from './ProgressView'
import CalendarView from './CalendarView'

const VIEWS: { id: PanelView; label: string }[] = [
  { id: 'progress', label: 'Progress' },
  { id: 'calendar', label: 'Calendar' },
]

export function ViewSwitch() {
  const view = useUi((s) => s.panelView)
  const setView = useUi((s) => s.setPanelView)
  return (
    <div role="tablist" aria-label="Panel view" className="flex rounded border border-line bg-ink/40 p-0.5">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          onClick={() => setView(v.id)}
          className={`relative flex-1 rounded px-3 py-1 text-[13px] transition-colors ${view === v.id ? 'text-text' : 'text-dim hover:text-text'}`}
        >
          {view === v.id && <motion.span layoutId="view-pill" className="absolute inset-0 rounded border border-line bg-white/[0.06]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="relative">{v.label}</span>
        </button>
      ))}
    </div>
  )
}

export default function TargetPanel({ target }: { target: Target }) {
  const year = useApp((s) => s.year)
  const selectRegion = useApp((s) => s.selectRegion)
  const stopTour = useApp((s) => s.stopTour)
  const view = useUi((s) => s.panelView)
  const isPlace = target.kind === 'place'
  const regionId = isPlace ? target.place.regionId : target.regionId
  const region = regionById(regionId)
  const title = isPlace ? target.place.name : (region?.name ?? '')
  const sub = isPlace ? target.place.context : region?.blurb
  const outside = isPlace && !target.place.regionId

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {isPlace && (
            <div className="mb-1.5">
              <PlaceChip />
            </div>
          )}
          <h2 className="text-[19px] leading-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] text-dim">{sub}</p>}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="text-right">
            <div className="readout text-[22px] text-text">{year}</div>
          </div>
          <button
            onClick={() => {
              stopTour()
              selectRegion(null)
            }}
            aria-label="Back to the global view"
            title="Back to the global view"
            className="rounded px-1.5 text-dim hover:bg-white/5 hover:text-text"
          >
            ✕
          </button>
        </div>
      </div>

      {outside ? (
        <OutsideNotice />
      ) : (
        <>
          <div className="mt-3">
            <ViewSwitch />
          </div>
          {view === 'progress' ? <ProgressView target={target} /> : <CalendarView target={target} />}
        </>
      )}
    </div>
  )
}
