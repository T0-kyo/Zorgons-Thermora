/**
 * SHARED CONTRACT — the only place the app talks to data.
 *
 * HYBRID MODE: every call tries the backend first and falls back to sample data when the
 * endpoint doesn't exist yet (404), fails, times out, or returns the wrong shape. So the
 * backend can ship endpoints one by one and the app picks each up with no frontend change.
 * `useDataStatus` (dataStatus.ts) records, per endpoint, whether the data is real or sample.
 *
 * Base URL: VITE_API_URL, else the team's deployed backend. VITE_API_URL=off forces sample data.
 * Components must call these functions, never fetch() directly.
 */
import type { DailyPoint, DayDetail, FireCell, ProgressSummary, Region, RegionSummary, Target } from './types'
import { REGIONS } from './regions'
import { mockCells, mockDaily, mockDay, mockProgress, mockSummary } from './mock'
import { useDataStatus } from './dataStatus'
export { searchPlaces, placeFromPoint, regionAt } from './places'

const DEFAULT_API = 'https://zorgons-thermora-776b3.containers.snapdeploy.app'
const ENV = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
const API = ENV === 'off' ? '' : (ENV || DEFAULT_API).replace(/\/+$/, '')
/** kept for compatibility: true only when the backend is switched off entirely */
export const USING_MOCK = !API

const TIMEOUT_MS = 8000
const missing = new Set<string>() // endpoints that answered 404: don't ask again this session

async function get<T>(path: string): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API}${path}`, { signal: ctrl.signal })
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${path}`), { status: res.status })
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

/** Try the backend, validate, else fall back to sample data. */
async function hybrid<T>(endpoint: string, path: string, valid: (x: unknown) => x is T, mock: () => Promise<T>): Promise<T> {
  const { mark, backend } = useDataStatus.getState()
  if (!API || missing.has(endpoint) || backend === 'down') {
    mark(endpoint, 'mock')
    return mock()
  }
  try {
    const data = await get<unknown>(path)
    if (!valid(data)) throw new Error(`unexpected shape from ${path}`)
    mark(endpoint, 'real')
    return data
  } catch (e) {
    if ((e as { status?: number }).status === 404) missing.add(endpoint)
    else console.warn('[thermora] backend call failed, using sample data:', (e as Error).message)
    mark(endpoint, 'mock')
    return mock()
  }
}

// ---- health check (once, at startup) --------------------------------------
export async function checkHealth() {
  const { setBackend } = useDataStatus.getState()
  if (!API) return setBackend('off')
  setBackend('checking')
  try {
    const h = await get<{ status?: string }>('/health')
    setBackend(String(h?.status).toLowerCase() === 'healthy' ? 'up' : 'down')
  } catch {
    setBackend('down')
  }
}
checkHealth()

// ---- shape checks (light: enough to never crash the UI) -------------------
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object'
const isCells = (x: unknown): x is FireCell[] =>
  Array.isArray(x) && (x.length === 0 || (isObj(x[0]) && 'lat' in x[0] && 'lng' in x[0] && 'legacy' in x[0] && 'harmonized' in x[0]))
const isSummary = (x: unknown): x is RegionSummary =>
  isObj(x) && 'undercountPct' in x && Array.isArray(x.weekdayCounts) && Array.isArray(x.trend)
const isProgress = (x: unknown): x is ProgressSummary => isObj(x) && Array.isArray(x.series) && 'changePct' in x
const isDaily = (x: unknown): x is DailyPoint[] => Array.isArray(x) && (x.length === 0 || (isObj(x[0]) && 'date' in x[0]))
const isDay = (x: unknown): x is DayDetail => isObj(x) && 'date' in x && 'firesHarmonized' in x
const isRegions = (x: unknown): x is Region[] => Array.isArray(x) && x.every((r) => isObj(r) && 'id' in r && 'name' in r)

export async function getRegions(): Promise<Region[]> {
  return hybrid('regions', '/regions', isRegions, async () => REGIONS)
}

/** regionId null/undefined = all regions (global view). */
export async function getCells(year: number, regionId?: string | null): Promise<FireCell[]> {
  const cells = await hybrid('cells', `/cells?year=${year}${regionId ? `&region=${regionId}` : ''}`, isCells, () => mockCells(year, regionId))
  // tolerate a backend that doesn't send `human` yet: neutral 0.5 (shows as "mixed")
  return cells.map((c) => (typeof c.human === 'number' ? c : { ...c, human: 0.5 }))
}

export async function getSummary(regionId: string, year: number): Promise<RegionSummary> {
  return hybrid('summary', `/regions/${regionId}/summary?year=${year}`, isSummary, () => mockSummary(regionId, year))
}

/** Query string for a region or a place target. */
const targetQs = (t: Target) =>
  t.kind === 'region'
    ? `region=${encodeURIComponent(t.regionId)}`
    : `lat=${t.place.lat}&lng=${t.place.lng}&radiusKm=${t.place.radiusKm}`

/** "How much worse since the start of the record" for a region or a place. */
export async function getProgress(t: Target): Promise<ProgressSummary> {
  return hybrid('progress', `/progress?${targetQs(t)}`, isProgress, () => mockProgress(t))
}

/** Every day of a year (for the calendar heatmap). */
export async function getDaily(t: Target, year: number): Promise<DailyPoint[]> {
  return hybrid('daily', `/daily?year=${year}&${targetQs(t)}`, isDaily, () => mockDaily(t, year))
}

/** One day's detail (for the day card and day-vs-day comparison). date = YYYY-MM-DD */
export async function getDay(t: Target, date: string): Promise<DayDetail> {
  return hybrid('day', `/day?date=${date}&${targetQs(t)}`, isDay, () => mockDay(t, date))
}

/** Current target from app state: the place if one is picked, else the region, else null (global). */
export function currentTarget(st: { place: import('./types').Place | null; regionId: string | null }): Target | null {
  if (st.place) return { kind: 'place', place: st.place }
  if (st.regionId) return { kind: 'region', regionId: st.regionId }
  return null
}

// Debug handle: await window.__thermoraApi.getProgress({ kind: 'region', regionId: 'amazon' })
;(globalThis as unknown as { __thermoraApi?: object }).__thermoraApi = {
  getRegions, getCells, getSummary, getProgress, getDaily, getDay, checkHealth,
  status: () => useDataStatus.getState(),
}
