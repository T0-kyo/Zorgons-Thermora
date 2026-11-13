/** OWNER: Agent B. Stub — replace freely. Region picker. */
import { useApp } from '../shared/store'
import { REGIONS } from '../shared/regions'

export default function RegionList() {
  const { regionId, selectRegion } = useApp()
  return (
    <nav className="panel pointer-events-auto w-60 p-3">
      <div className="label mb-2">Regions</div>
      <button
        onClick={() => selectRegion(null)}
        className={`block w-full rounded px-2 py-1 text-left text-sm ${regionId === null ? 'text-cyan' : 'text-dim hover:text-text'}`}
      >
        ◎ Global view
      </button>
      {REGIONS.map((r) => (
        <button
          key={r.id}
          onClick={() => selectRegion(r.id)}
          className={`block w-full rounded px-2 py-1 text-left text-sm ${regionId === r.id ? 'bg-cyan/10 text-cyan' : 'text-text/80 hover:text-text'}`}
        >
          {r.name}
        </button>
      ))}
    </nav>
  )
}
