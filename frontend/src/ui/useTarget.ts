/** OWNER: Agent B. The panel's subject: the picked place, else the selected region, else null (global). */
import { useMemo } from 'react'
import { useApp } from '../shared/store'
import { currentTarget } from '../shared/api'

export function useTarget() {
  const place = useApp((s) => s.place)
  const regionId = useApp((s) => s.regionId)
  return useMemo(() => currentTarget({ place, regionId }), [place, regionId])
}
