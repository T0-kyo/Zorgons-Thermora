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
/** data endpoints live under /api on the team backend (ASP.NET [Route("api")]); /health is at the root */
const DATA_PREFIX = ((import.meta.env.VITE_API_PREFIX as string | undefined) ?? '/api').replace(/\/+$/, '')

const TIMEOUT_MS = 8000
const missing = new Set<string>() // endpoints that answered 404: don't ask again this session

async function get<T>(path: string, root = false): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API}${root ? '' : DATA_PREFIX}${path}`, { signal: ctrl.signal })
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${path}`), { status: res.status })
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

/**
 * Try the backend, normalise its response to our types, else fall back to sample data.
 * `normalize` returns null when the response isn't usable (e.g. a "coming soon" placeholder).
 */
async function hybrid<T>(endpoint: string, path: string, normalize: (x: unknown) => T | null, mock: () => Promise<T>): Promise<T> {
  const { mark, backend } = useDataStatus.getState()
  if (!API || missing.has(endpoint) || backend === 'down') {
    mark(endpoint, 'mock')
    return mock()
  }
  try {
    const data = normalize(await get<unknown>(path))
    if (data === null) throw new Error(`unexpected shape from ${path}`)
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
    const h = await get<{ status?: string }>('/health', true)
    setBackend(String(h?.status).toLowerCase() === 'healthy' ? 'up' : 'down')
  } catch {
    setBackend('down')
  }
}
checkHealth()

// ---- normalisers: accept the backend's shapes, return ours (null = unusable) ----
// The team backend (Backend/api/DTOs) differs from API_CONTRACT.md in a few places; we absorb it here:
//  - undercountCi as a string "±4.3%"            → [lo, hi]
//  - humanScoreLegacy / humanScoreHarmonized    → humanScore { legacy, harmonized }
//  - progress humanLikelihood as one number     → { legacy, harmonized }
//  - direction increasing / decreasing          → worse / better
//  - DateTime dates "2019-01-01T00:00:00"        → "2019-01-01"
type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d)
const ymd = (v: unknown) => String(v ?? '').slice(0, 10)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function normCells(x: unknown): FireCell[] | null {
  if (!Array.isArray(x)) return null
  if (x.length && !(isObj(x[0]) && 'lat' in x[0] && 'lng' in x[0])) return null
  return x.map((r: Obj) => ({
    lat: num(r.lat), lng: num(r.lng),
    regionId: String(r.regionId ?? r.region ?? ''),
    legacy: num(r.legacy), harmonized: num(r.harmonized, num(r.legacy)),
    human: clamp01(num(r.human, 0.5)),
  }))
}

function parseCi(v: unknown, pct: number): [number, number] {
  if (Array.isArray(v) && v.length >= 2) return [num(v[0]), num(v[1])]
  if (typeof v === 'string') {
    const nums = v.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    if (nums.length >= 2) return [nums[0], nums[1]]
    if (nums.length === 1) return [+(pct - nums[0]).toFixed(1), +(pct + nums[0]).toFixed(1)] // "±4.3%"
  }
  return [pct, pct]
}

function normSummary(x: unknown, regionId: string, year: number): RegionSummary | null {
  if (!isObj(x) || !('undercountPct' in x)) return null
  const pct = num(x.undercountPct)
  const hs = isObj(x.humanScore) ? x.humanScore : null
  const trend = Array.isArray(x.trend) ? x.trend.filter(isObj).map((t) => ({
    year: num(t.year), raw: num(t.raw), corrected: num(t.corrected, num(t.raw)), lo: num(t.lo, num(t.corrected)), hi: num(t.hi, num(t.corrected)),
  })) : []
  const weekday = Array.isArray(x.weekdayCounts) ? x.weekdayCounts.map((v) => num(v)) : []
  return {
    regionId: String(x.regionId ?? regionId), year: num(x.year, year),
    undercountPct: pct, undercountCi: parseCi(x.undercountCi, pct),
    firesLegacy: num(x.firesLegacy), firesHarmonized: num(x.firesHarmonized),
    humanScore: {
      legacy: clamp01(num(hs?.legacy, num(x.humanScoreLegacy, 0.5))),
      harmonized: clamp01(num(hs?.harmonized, num(x.humanScoreHarmonized, 0.5))),
    },
    weekdayCounts: weekday.length === 7 ? weekday : [0, 0, 0, 0, 0, 0, 0],
    trend,
    trendSurvives: Boolean(x.trendSurvives),
    verdict: typeof x.verdict === 'string' ? x.verdict : '',
  }
}

function normRegions(x: unknown): Region[] | null {
  if (!Array.isArray(x) || !x.length || !x.every((r) => isObj(r) && 'id' in r && 'name' in r)) return null
  // keep our camera views / country outlines for known ids; take names + blurbs from the backend
  return (x as Obj[]).map((r) => {
    const local = REGIONS.find((l) => l.id === r.id)
    return {
      id: String(r.id), name: String(r.name),
      blurb: typeof r.blurb === 'string' ? r.blurb : (local?.blurb ?? ''),
      center: isObj(r.center) ? { lat: num(r.center.lat), lng: num(r.center.lng), altitude: num(r.center.altitude, 1.4) } : (local?.center ?? { lat: 0, lng: 0, altitude: 2 }),
      countries: local?.countries ?? [],
    }
  })
}

export async function getRegions(): Promise<Region[]> {
  return hybrid('regions', '/regions', normRegions, async () => REGIONS)
}

/** regionId null/undefined = all regions (global view). Sends both `region` and `regionId` (backend uses the latter). */
export async function getCells(year: number, regionId?: string | null): Promise<FireCell[]> {
  const q = regionId ? `&region=${regionId}&regionId=${regionId}` : ''
  return hybrid('cells', `/cells?year=${year}${q}`, normCells, () => mockCells(year, regionId))
}

export async function getSummary(regionId: string, year: number): Promise<RegionSummary> {
  return hybrid('summary', `/regions/${regionId}/summary?year=${year}`, (x) => normSummary(x, regionId, year), () => mockSummary(regionId, year))
}

/** Query string for a region or a place target. */
const targetQs = (t: Target) =>
  t.kind === 'region'
    ? `region=${encodeURIComponent(t.regionId)}`
    : `lat=${t.place.lat}&lng=${t.place.lng}&radiusKm=${t.place.radiusKm}`

/** "How much worse since the start of the record" for a region or a place. */
export async function getProgress(t: Target): Promise<ProgressSummary> {
  return hybrid('progress', `/progress?${targetQs(t)}`, (x) => normProgress(x, t), () => mockProgress(t))
}

/** Every day of a year (for the calendar heatmap). */
export async function getDaily(t: Target, year: number): Promise<DailyPoint[]> {
  return hybrid('daily', `/daily?year=${year}&${targetQs(t)}`, normDaily, () => mockDaily(t, year))
}

/** One day's detail (for the day card and day-vs-day comparison). date = YYYY-MM-DD */
export async function getDay(t: Target, date: string): Promise<DayDetail> {
  return hybrid('day', `/day?date=${date}&${targetQs(t)}`, normDay, () => mockDay(t, date))
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

// ---- normalisers for target endpoints --------------------------------------
function normProgress(x: unknown, t: Target): ProgressSummary | null {
  if (!isObj(x) || !Array.isArray(x.series) || !('changePct' in x)) return null
  const series = x.series.filter(isObj).map((p) => ({ year: num(p.year), legacy: num(p.legacy), harmonized: num(p.harmonized) }))
  const dirRaw = String(x.direction ?? '').toLowerCase()
  const change = num(x.changePct)
  const direction: ProgressSummary['direction'] =
    dirRaw === 'worse' || dirRaw.startsWith('increas') || dirRaw === 'up' ? 'worse'
    : dirRaw === 'better' || dirRaw.startsWith('decreas') || dirRaw === 'down' ? 'better'
    : dirRaw === 'stable' ? 'stable'
    : change > 10 ? 'worse' : change < -10 ? 'better' : 'stable'
  const hl = x.humanLikelihood
  const human = isObj(hl)
    ? { legacy: clamp01(num(hl.legacy, 0.5)), harmonized: clamp01(num(hl.harmonized, 0.5)) }
    : { legacy: clamp01(num(hl, 0.5)), harmonized: clamp01(num(hl, 0.5)) }
  const years = isObj(x.years)
    ? { first: num(x.years.first), last: num(x.years.last) }
    : { first: series[0]?.year ?? 2001, last: series[series.length - 1]?.year ?? 2025 }
  const name = typeof x.name === 'string' && x.name ? x.name : t.kind === 'place' ? t.place.name : (REGIONS.find((r) => r.id === t.regionId)?.name ?? t.regionId)
  return {
    name, years, series,
    baseline: num(x.baseline), recent: num(x.recent), changePct: change, direction,
    humanLikelihood: human,
    covered: x.covered === undefined ? series.some((p) => p.harmonized > 0) : Boolean(x.covered),
  }
}

function normDaily(x: unknown): DailyPoint[] | null {
  if (!Array.isArray(x)) return null
  if (x.length && !(isObj(x[0]) && 'date' in x[0])) return null
  return x.map((d: Obj) => ({ date: ymd(d.date), legacy: num(d.legacy), harmonized: num(d.harmonized, num(d.legacy)) }))
}

function normDay(x: unknown): DayDetail | null {
  if (!isObj(x) || !('date' in x) || !('firesHarmonized' in x)) return null
  const date = ymd(x.date)
  const wd = 'weekday' in x ? num(x.weekday) : (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7
  return {
    date, weekday: wd, isWeekend: 'isWeekend' in x ? Boolean(x.isWeekend) : wd >= 5,
    firesLegacy: num(x.firesLegacy), firesHarmonized: num(x.firesHarmonized),
    humanLikelihood: clamp01(num(x.humanLikelihood, 0.5)),
    vsYearAvgPct: num(x.vsYearAvgPct), vsWeekdayAvgPct: num(x.vsWeekdayAvgPct), rankInYear: num(x.rankInYear),
  }
}
