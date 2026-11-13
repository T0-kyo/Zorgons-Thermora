/**
 * OWNER: Agent B. React hooks over src/shared/api.ts (never fetch() here).
 * Results are cached per key so scrubbing years or flipping regions doesn't refetch.
 */
import { useEffect, useState } from 'react'
import { getCells, getSummary } from '../shared/api'
import type { RegionSummary } from '../shared/types'

/** % more fires in the harmonized record than in the legacy one (same formula as the summary). */
export const undercountPct = (legacy: number, harmonized: number) =>
  legacy > 0 ? ((harmonized - legacy) / legacy) * 100 : 0

const summaryCache = new Map<string, Promise<RegionSummary>>()

function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>) {
  let p = cache.get(key)
  if (!p) {
    p = load()
    cache.set(key, p)
    p.catch(() => cache.delete(key)) // allow retry after a failure
  }
  return p
}

export function fetchSummary(regionId: string, year: number) {
  return cached(summaryCache, `${regionId}:${year}`, () => getSummary(regionId, year))
}

/** Summary for the region/year. Keeps the previous year's data while the next loads (no flicker). */
export function useSummary(regionId: string | null, year: number) {
  const [state, setState] = useState<{ data: RegionSummary | null; error: boolean }>({ data: null, error: false })
  useEffect(() => {
    if (!regionId) return
    let live = true
    fetchSummary(regionId, year)
      .then((data) => live && setState({ data, error: false }))
      .catch(() => live && setState((s) => ({ ...s, error: true })))
    return () => {
      live = false
    }
  }, [regionId, year])
  // never show another region's numbers
  const data = state.data && state.data.regionId === regionId ? state.data : null
  return { data, error: state.error && !data }
}

export interface Totals {
  legacy: number
  harmonized: number
  pct: number
}
export interface YearTotals {
  global: Totals
  byRegion: Record<string, Totals>
}

const totalsCache = new Map<string, Promise<YearTotals>>()

/** Global + per-region fire totals for a year, aggregated from getCells(year). */
export function fetchYearTotals(year: number) {
  return cached(totalsCache, String(year), async () => {
    const cells = await getCells(year, null)
    const byRegion: Record<string, Totals> = {}
    let L = 0
    let H = 0
    for (const c of cells) {
      const t = (byRegion[c.regionId] ??= { legacy: 0, harmonized: 0, pct: 0 })
      t.legacy += c.legacy
      t.harmonized += c.harmonized
      L += c.legacy
      H += c.harmonized
    }
    for (const t of Object.values(byRegion)) t.pct = undercountPct(t.legacy, t.harmonized)
    return { global: { legacy: L, harmonized: H, pct: undercountPct(L, H) }, byRegion }
  })
}

export function useYearTotals(year: number) {
  const [data, setData] = useState<YearTotals | null>(null)
  useEffect(() => {
    let live = true
    fetchYearTotals(year)
      .then((d) => live && setData(d))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [year])
  return data
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
export const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`
