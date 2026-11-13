/** Record/colour switch set as plain type on the globe: the active one is underlined, no pills. */
import { useApp } from '../shared/store'
import type { Mode } from '../shared/types'

const TABS: { id: Mode; label: string; hint: string }[] = [
  { id: 'human', label: 'Human or natural', hint: 'Colour fires by how likely people lit them (H)' },
  { id: 'harmonized', label: 'Harmonized (MODIS + VIIRS)', hint: 'MODIS harmonized with VIIRS: the small fires the old record missed are back' },
]

export default function ModeTabs() {
  const mode = useApp((s) => s.mode)
  const setMode = useApp((s) => s.setMode)
  // only two views are offered; older states (legacy/difference) show as Harmonized
  const shown = mode === 'human' ? 'human' : 'harmonized'
  return (
    <div role="radiogroup" aria-label="What the fires show" className="flex items-baseline gap-6 text-[14px]">
      {TABS.map((t) => {
        const on = shown === t.id
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={on}
            title={t.hint}
            onClick={() => setMode(t.id)}
            className={`border-b pb-0.5 transition-colors ${on ? 'border-text text-text' : 'border-transparent text-dim hover:text-text'}`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
