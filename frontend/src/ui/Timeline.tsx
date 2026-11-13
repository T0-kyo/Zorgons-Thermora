/** OWNER: Agent B. Stub — replace freely. Year slider + play. */
import { useApp } from '../shared/store'
import { YEARS } from '../shared/types'

export default function Timeline() {
  const { year, setYear } = useApp()
  return (
    <footer className="panel pointer-events-auto flex items-center gap-3 px-4 py-2">
      <span className="font-mono text-xs text-dim">{YEARS.min}</span>
      <input
        type="range"
        min={YEARS.min}
        max={YEARS.max}
        value={year}
        onChange={(e) => setYear(+e.target.value)}
        className="flex-1 accent-cyan"
      />
      <span className="font-mono text-xs text-dim">{YEARS.max}</span>
      <span className="w-12 text-right font-mono text-cyan">{year}</span>
    </footer>
  )
}
