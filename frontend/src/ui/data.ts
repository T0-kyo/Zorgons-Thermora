/**
 * OWNER: Agent B. React hooks over src/shared/api.ts (never fetch() here).
 * Results are cached per key so scrubbing years or flipping regions doesn't refetch.
 */
import { useEffect, useState } from 'react'
import { getDaily, getDay, getGlobalSummary, getProgress, getSummary } from '../shared/api'
import { REGIONS } from '../shared/regions'
import type { DailyPoint, DayDetail, ProgressSummary, RegionSummary, Target } from '../shared/types'

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
  /** area likelihood (0–1) that fire is human-driven, weighted by harmonized fires */
  human: number
}
export interface YearTotals {
  /** null when /api/summary did not answer */
  global: Totals | null
  byRegion: Record<string, Totals>
}

const totalsCache = new Map<string, Promise<YearTotals>>()

/**
 * Global + per-country totals for a year, from the backend's summaries (every fire counted:
 * /api/countries/{id}/summary per country and /api/summary for the world), not from the
 * globe's grid, which the backend caps at the 3000 busiest squares.
 * human = NaN when the backend has no score for that area (shown as "no score").
 */
export function fetchYearTotals(year: number) {
  return cached(totalsCache, `${year}:${REGIONS.map((r) => r.id).join('|')}`, async () => {
    const toTotals = (s: RegionSummary): Totals => ({
      legacy: s.firesLegacy, harmonized: s.firesHarmonized,
      pct: undercountPct(s.firesLegacy, s.firesHarmonized), human: s.humanScore.harmonized,
    })
    // each figure stands alone: a failed call leaves only its own number blank
    const [g, ...rows] = await Promise.all([
      getGlobalSummary(year).catch(() => null),
      ...REGIONS.map((r) => fetchSummary(r.id, year).catch(() => null)),
    ])
    const byRegion: Record<string, Totals> = {}
    REGIONS.forEach((r, i) => { const x = rows[i]; if (x) byRegion[r.id] = toTotals(x) })
    if (!g && !Object.keys(byRegion).length) throw new Error('no summaries available')
    return { global: g ? toTotals(g) : null, byRegion }
  })
}

export { fmtHuman } from '../charts/stats'

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

// ---- places, progress, calendar (B14–B18) ---------------------------------------------

/** Stable cache key for a region or place target. */
export const targetKey = (t: Target) =>
  t.kind === 'region' ? `r:${t.regionId}` : `p:${t.place.lat.toFixed(3)},${t.place.lng.toFixed(3)},${t.place.radiusKm}`

const progressCache = new Map<string, Promise<ProgressSummary>>()
const dailyCache = new Map<string, Promise<DailyPoint[]>>()
const dayCache = new Map<string, Promise<DayDetail>>()

export const fetchProgress = (t: Target) => cached(progressCache, targetKey(t), () => getProgress(t))
export const fetchDaily = (t: Target, year: number) => cached(dailyCache, `${targetKey(t)}:${year}`, () => getDaily(t, year))
export const fetchDay = (t: Target, date: string) => cached(dayCache, `${targetKey(t)}:${date}`, () => getDay(t, date))

/** Generic cached loader: returns data only for the current key (never another target's). */
function useKeyed<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: boolean }>({ key: null, data: null, error: false })
  useEffect(() => {
    if (!key) return
    let live = true
    load()
      .then((data) => live && setState({ key, data, error: false }))
      .catch(() => live && setState({ key, data: null, error: true }))
    return () => {
      live = false
    }
    // load is derived from key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const fresh = state.key === key
  return { data: fresh ? state.data : null, error: fresh && state.error, loading: !!key && !fresh }
}

export const useProgress = (t: Target | null) => useKeyed(t ? targetKey(t) : null, () => fetchProgress(t!))
export const useDaily = (t: Target | null, year: number) => useKeyed(t ? `${targetKey(t)}:${year}` : null, () => fetchDaily(t!, year))
export const useDay = (t: Target | null, date: string | null) =>
  useKeyed(t && date ? `${targetKey(t)}:${date}` : null, () => fetchDay(t!, date!))

export const fmtSigned = (n: number, digits = 0) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}%`

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
export const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`
