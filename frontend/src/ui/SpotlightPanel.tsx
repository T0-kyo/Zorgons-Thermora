/** OWNER: Agent B. Stub — replace freely. Region stats + charts (see TASKS.md B3–B6). */
import { useEffect, useState } from 'react'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import { getSummary } from '../shared/api'
import type { RegionSummary } from '../shared/types'

export default function SpotlightPanel() {
  const { regionId, year } = useApp()
  const [s, setS] = useState<RegionSummary | null>(null)
  const region = regionById(regionId)

  useEffect(() => {
    if (!regionId) return
    let live = true
    getSummary(regionId, year).then((d) => live && setS(d))
    return () => { live = false }
  }, [regionId, year])

  if (!region) return null
  return (
    <aside className="panel pointer-events-auto w-80 p-4">
      <div className="label">Region spotlight</div>
      <h2 className="mt-1 text-lg font-semibold">{region.name}</h2>
      <p className="text-sm text-dim">{region.blurb}</p>
      {s && (
        <div className="mt-4">
          <div className="label">Fires missed by legacy record · {s.year}</div>
          <div className="font-mono text-4xl text-missed">+{s.undercountPct}%</div>
          <div className="font-mono text-xs text-dim">CI {s.undercountCi[0]}–{s.undercountCi[1]}%</div>
          <div className="mt-3 font-mono text-xs text-dim">human score {s.humanScore.legacy} → {s.humanScore.harmonized}</div>
          <div className="mt-1 text-xs">{s.verdict}</div>
        </div>
      )}
    </aside>
  )
}
