/** OWNER: Agent B. B7 — year slider + ▶ play (steps `year` every 1.2s while `playing`). */
import { useApp } from '../shared/store'
import { YEARS } from '../shared/types'

const SPAN = YEARS.max - YEARS.min
const at = (y: number) => `${((y - YEARS.min) / SPAN) * 100}%`

export default function Timeline({ compact = false }: { compact?: boolean }) {
  const year = useApp((s) => s.year)
  const playing = useApp((s) => s.playing)
  const setYear = useApp((s) => s.setYear)
  const setPlaying = useApp((s) => s.setPlaying)
  const stopTour = useApp((s) => s.stopTour)

  const toggle = () => {
    stopTour()
    if (!playing && year >= YEARS.max) setYear(YEARS.min)
    setPlaying(!playing)
  }

  return (
    <footer className={`panel pointer-events-auto flex items-center ${compact ? 'gap-2 px-2.5 py-1.5' : 'gap-4 px-4 py-2.5'}`}>
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause year playback' : 'Play years'}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs transition-colors ${
          playing ? 'border-cyan bg-cyan/20 text-cyan' : 'border-cyan/40 text-cyan hover:bg-cyan/10'
        }`}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <div className="relative flex-1 pt-3.5 pb-3">
        {/* VIIRS-era shading: from 2012 both sensors overlap; before that the record is MODIS-only */}
        <div className="pointer-events-none absolute top-[22px] right-0 h-1 rounded-r bg-cyan/25" style={{ left: at(2012) }} />
        <div className="pointer-events-none absolute top-0 -translate-x-1/2 text-[11px] whitespace-nowrap text-cyan/80" style={{ left: at(2012) }}>
          VIIRS era ▾
        </div>
        <input
          type="range"
          min={YEARS.min}
          max={YEARS.max}
          step={1}
          value={year}
          aria-label="Year"
          onChange={(e) => {
            stopTour()
            setPlaying(false)
            setYear(+e.target.value)
          }}
          className="timeline-range relative w-full"
        />
        {!compact && (
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 text-[11px] text-dim">
            {[2001, 2005, 2010, 2015, 2020, 2025].map((y) => (
              <span key={y} className="absolute -translate-x-1/2" style={{ left: at(y) }}>
                {y}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={`shrink-0 text-right ${compact ? 'w-14' : 'w-28'}`}>
        <div className={`readout text-cyan ${compact ? 'text-[19px]' : 'text-[24px]'}`}>{year}</div>
        {!compact && <div className="label mt-0.5">{year < 2012 ? 'MODIS only' : 'MODIS and VIIRS'}</div>}
      </div>
    </footer>
  )
}
