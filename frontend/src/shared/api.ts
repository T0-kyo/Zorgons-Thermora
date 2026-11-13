/**
 * SHARED CONTRACT — the only place the app talks to data.
 * Set VITE_API_URL to use the real backend; otherwise mocks are served.
 * Components must call these functions, never fetch() directly.
 */
import type { DailyPoint, DayDetail, FireCell, ProgressSummary, Region, RegionSummary, Target } from './types'
import { REGIONS } from './regions'
import { mockCells, mockDaily, mockDay, mockProgress, mockSummary } from './mock'
export { searchPlaces, placeFromPoint, regionAt } from './places'

const API = import.meta.env.VITE_API_URL as string | undefined
export const USING_MOCK = !API

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json()
}

export async function getRegions(): Promise<Region[]> {
  return USING_MOCK ? REGIONS : get('/regions')
}

/** regionId null/undefined = all regions (global view). */
export async function getCells(year: number, regionId?: string | null): Promise<FireCell[]> {
  if (USING_MOCK) return mockCells(year, regionId)
  return get(`/cells?year=${year}${regionId ? `&region=${regionId}` : ''}`)
}

export async function getSummary(regionId: string, year: number): Promise<RegionSummary> {
  if (USING_MOCK) return mockSummary(regionId, year)
  return get(`/regions/${regionId}/summary?year=${year}`)
}

/** Query string for a region or a place target. */
const targetQs = (t: Target) =>
  t.kind === 'region'
    ? `region=${encodeURIComponent(t.regionId)}`
    : `lat=${t.place.lat}&lng=${t.place.lng}&radiusKm=${t.place.radiusKm}`

/** "How much worse since the start of the record" for a region or a place. */
export async function getProgress(t: Target): Promise<ProgressSummary> {
  if (USING_MOCK) return mockProgress(t)
  return get(`/progress?${targetQs(t)}`)
}

/** Every day of a year (for the calendar heatmap). */
export async function getDaily(t: Target, year: number): Promise<DailyPoint[]> {
  if (USING_MOCK) return mockDaily(t, year)
  return get(`/daily?year=${year}&${targetQs(t)}`)
}

/** One day's detail (for the day card and day-vs-day comparison). date = YYYY-MM-DD */
export async function getDay(t: Target, date: string): Promise<DayDetail> {
  if (USING_MOCK) return mockDay(t, date)
  return get(`/day?date=${date}&${targetQs(t)}`)
}

/** Current target from app state: the place if one is picked, else the region, else null (global). */
export function currentTarget(st: { place: import('./types').Place | null; regionId: string | null }): Target | null {
  if (st.place) return { kind: 'place', place: st.place }
  if (st.regionId) return { kind: 'region', regionId: st.regionId }
  return null
}

// Debug handle: await window.__thermoraApi.getProgress({ kind: 'region', regionId: 'amazon' })
;(globalThis as unknown as { __thermoraApi?: object }).__thermoraApi = {
  getRegions, getCells, getSummary, getProgress, getDaily, getDay,
}
