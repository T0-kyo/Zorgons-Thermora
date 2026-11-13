/** OWNER: Agent B. Stub — replace freely. Brand, mode toggle, tour button. */
import { useApp } from '../shared/store'
import type { Mode } from '../shared/types'

const MODES: { id: Mode; label: string }[] = [
  { id: 'legacy', label: 'Legacy · MODIS' },
  { id: 'harmonized', label: 'Harmonized' },
  { id: 'difference', label: 'Missed fires' },
]

export default function TopBar() {
  const { mode, setMode } = useApp()
  return (
    <header className="panel pointer-events-auto flex items-center gap-6 px-4 py-2">
      <div>
        <div className="font-semibold tracking-[0.2em]">THERMORA</div>
        <div className="label">MODIS × VIIRS · corrected fire record</div>
      </div>
      <div className="ml-auto flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`rounded px-3 py-1 font-mono text-xs ${mode === m.id ? 'bg-cyan/20 text-cyan' : 'text-dim hover:text-text'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </header>
  )
}
