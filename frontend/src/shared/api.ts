/**
 * SHARED CONTRACT — the only place the app talks to data.
 *
 * REAL DATA ONLY: every number on screen comes from the team backend. If a call fails, times out
 * or returns an unusable shape, the call throws and the UI says the data is unavailable. There is
 * no sample or placeholder data anywhere in the app.
 * `useDataStatus` (dataStatus.ts) records, per endpoint, whether it answered ('real') or not ('error').
 *
 * Base URL: VITE_API_URL, else the team's deployed backend.
 * Components must call these functions, never fetch() directly.
 */
import { YEARS } from './types'
import type { ConfidenceLevel, HumanStats, StatTrend, DailyPoint, DayDetail, FireCell, ProgressSummary, Region, RegionSummary, Target } from './types'
import { geoBounds, geoCentroid } from 'd3-geo'
import type { Feature } from 'geojson'
import { REGIONS } from './regions'
import { useDataStatus } from './dataStatus'
import { useApp } from './store'
export { searchPlaces, placeFromPoint, regionAt } from './places'

const DEFAULT_API = 'https://zorgons-thermora-776b3.containers.snapdeploy.app'
const ENV = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
const API = (ENV || DEFAULT_API).replace(/\/+$/, '')
/** data endpoints live under /api on the team backend (ASP.NET [Route("api")]); /health is at the root */
const DATA_PREFIX = ((import.meta.env.VITE_API_PREFIX as string | undefined) ?? '/api').replace(/\/+$/, '')

/**
 * Very generous timeouts: the backend container can take 1–2 minutes to wake up, and its first
 * queries read the parquet files from HuggingFace. A request is only abandoned after this long.
 */
const HEALTH_TIMEOUT_MS = 150_000
const DATA_TIMEOUT_MS = 180_000

async function get<T>(path: string, root = false, timeout = DATA_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(`${API}${root ? '' : DATA_PREFIX}${path}`, { signal: ctrl.signal })
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${path}`), { status: res.status })
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** resolves once /health answers; data calls wait for it instead of failing while the server wakes */
let markReady: () => void = () => {}
const ready = new Promise<void>((r) => { markReady = r })

/**
 * Call the backend and normalise its response to our types. Waits while the server wakes up,
 * retries a failed call twice (cold queries can time out or 502), then throws: nothing is invented.
 */
async function live<T>(endpoint: string, path: string, normalize: (x: unknown) => T | null): Promise<T> {
  await ready
  const { mark } = useDataStatus.getState()
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = normalize(await get<unknown>(path))
      if (data === null) throw Object.assign(new Error(`unexpected shape from ${path}`), { final: true })
      mark(endpoint, 'real')
      return data
    } catch (e) {
      last = e
      const status = (e as { status?: number }).status
      // only a dropped connection, a timeout or a gateway/waking reply (502/503/504) can fix itself;
      // a wrong shape, a 4xx or a 500 from the query won't, so fail fast
      if ((e as { final?: boolean }).final || (status && ![502, 503, 504].includes(status))) break
      await sleep(4000 * (attempt + 1))
    }
  }
  console.warn('[thermora] backend call failed:', (last as Error).message)
  mark(endpoint, 'error')
  throw last
}

// ---- health check: keep trying until the backend answers ---------------------
export async function checkHealth() {
  const { setBackend } = useDataStatus.getState()
  setBackend('checking')
  const started = Date.now()
  for (let attempt = 1; ; attempt++) {
    try {
      const h = await get<{ status?: string }>('/health', true, HEALTH_TIMEOUT_MS)
      if (String(h?.status).toLowerCase() === 'healthy') {
        setBackend('up')
        markReady()
        void syncRegions(); void syncMeta()
        return
      }
    } catch { /* still waking: retry */ }
    // first ~5 minutes: "waking up"; after that "unreachable", but never stop trying
    setBackend(Date.now() - started < 5 * 60_000 ? 'waking' : 'down', started)
    await sleep(Math.min(30_000, 3000 * attempt))
  }
}

/**
 * Use the backend's region list when it serves one, so region ids always match the data.
 * Known ids keep our camera views and outlines; new ids get the backend's centre.
 * Mutates the shared REGIONS array in place and bumps regionsVersion so the UI re-renders.
 */
async function syncRegions() {
  try {
    // the team uses countries (GET /api/countries → [{ id, name }]); /regions kept as a fallback
    let list: Region[] | null = null
    for (let attempt = 0; attempt < 3 && !list?.length; attempt++) {
      if (attempt) await sleep(4000 * attempt) // cold first query: try again
      list = await countriesToRegions(await get<unknown>('/countries').catch(() => null))
    }
    if (!list?.length) list = normRegions(await get<unknown>('/regions').catch(() => null))
    if (!list || !list.length) { useDataStatus.getState().mark('regions', 'error'); return }
    REGIONS.splice(0, REGIONS.length, ...list)
    useDataStatus.setState((st) => ({ regionsVersion: st.regionsVersion + 1 }))
    useDataStatus.getState().mark('regions', 'real')
  } catch {
    useDataStatus.getState().mark('regions', 'error')
  }
}
/** Years the backend actually has (from /api/meta). null until known. */
export let dataYears: { min: number; max: number } | null = null
/** Open on the latest year with data, so the globe isn't empty on landing. */
async function syncMeta() {
  try {
    const m = await get<Obj>('/meta')
    const min = +String(m?.minDate ?? '').slice(0, 4), max = +String(m?.maxDate ?? '').slice(0, 4)
    if (!min || !max) return
    dataYears = { min, max }
    // the year slider only offers years the backend has
    YEARS.min = min; YEARS.max = max
    useDataStatus.setState((st) => ({ regionsVersion: st.regionsVersion + 1 }))
    const st = useApp.getState()
    if (!st.touring && (st.year < min || st.year > max)) st.setYear(max)
  } catch { /* keep the default year */ }
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
    human: r.human == null ? -1 : clamp01(num(r.human, 0)),
    humanLow: scoreOrNaN(r.humanLow), humanHigh: scoreOrNaN(r.humanHigh),
    confidence: level(r.confidence),
    scoredFires: num(r.scoredFires, NaN),
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
  const trend = Array.isArray(x.trend) && x.trend.length && isObj(x.trend[0]) && 'raw' in x.trend[0] ? x.trend.filter(isObj).map((t) => ({
    year: num(t.year), raw: num(t.raw), corrected: num(t.corrected, num(t.raw)), lo: num(t.lo, num(t.corrected)), hi: num(t.hi, num(t.corrected)),
  })) : []
  const weekday = Array.isArray(x.weekdayCounts) ? x.weekdayCounts.map((v) => num(v)) : []
  return {
    regionId: String(x.regionId ?? regionId), year: num(x.year, year),
    undercountPct: pct, undercountCi: parseCi(x.undercountCi, pct),
    firesLegacy: num(x.firesLegacy), firesHarmonized: num(x.firesHarmonized),
    humanScore: {
      legacy: scoreOrNaN(hs?.legacy ?? x.humanScoreLegacy),
      harmonized: scoreOrNaN(hs?.harmonized ?? x.humanScoreHarmonized),
    },
    // totalFires must count fire records; while the backend still sends the detection sum (= firesHarmonized),
    // leave it out rather than show a misleading "X of Y fires"
    humanStats: humanStats(x.humanScoreLow, x.humanScoreHigh, x.confidence, x.scoredFires,
      num(x.totalFires, NaN) === num(x.firesHarmonized, NaN) ? null : x.totalFires),
    // the team backend counts EXTRACT(dow) 0..6 = Sun..Sat; our charts are Monday-first
    weekdayCounts: weekday.length === 7 ? (x.weekdayStart === 'monday' ? weekday : [...weekday.slice(1), weekday[0]]) : [0, 0, 0, 0, 0, 0, 0],
    trend,
    statTrend: normStatTrend(x.trend),
    trendSurvives: Boolean(x.trendSurvives),
    verdict: typeof x.verdict === 'string' ? x.verdict : '',
  }
}

/** the science team's trend object on /countries/{id}/summary, exactly as sent (null when absent) */
function normStatTrend(t: unknown): StatTrend | null {
  if (!isObj(t) || !Array.isArray(t.series)) return null
  const series = t.series.filter(isObj).map((p) => ({ year: num(p.year), count: num(p.count, NaN) })).filter((p) => p.year && Number.isFinite(p.count))
  if (!series.length) return null
  return { series, slope: num(t.slope, NaN), direction: String(t.direction ?? ''), significance: String(t.significance ?? ''), pValue: num(t.pValue, NaN) }
}

/** null / missing = the backend has no score for the area ("no score"); a real 0.0 stays 0.0 */
function scoreOrNaN(v: unknown) { const n = num(v, NaN); return Number.isFinite(n) ? clamp01(n) : NaN }

const LEVELS = ['low', 'medium', 'high'] as const
function level(v: unknown): ConfidenceLevel | null {
  const s = String(v ?? '').toLowerCase()
  return (LEVELS as readonly string[]).includes(s) ? (s as ConfidenceLevel) : null
}
/** range, confidence counts and coverage, exactly as the backend sends them (no gaps filled) */
function humanStats(low: unknown, high: unknown, conf: unknown, scored: unknown, total: unknown): HumanStats {
  let counts: HumanStats['counts'] = null
  let confidence: ConfidenceLevel | null = level(conf)
  if (isObj(conf)) {
    counts = { low: num(conf.low), medium: num(conf.medium), high: num(conf.high) }
    const best = LEVELS.reduce((a, b) => (counts![b] > counts![a] ? b : a), 'low' as ConfidenceLevel)
    confidence = counts[best] > 0 ? best : null
  }
  return { low: scoreOrNaN(low), high: scoreOrNaN(high), counts, confidence, scoredFires: num(scored, NaN), totalFires: num(total, NaN) }
}

function normRegions(x: unknown): Region[] | null {
  if (!Array.isArray(x) || !x.length || !x.every((r) => isObj(r) && 'id' in r && 'name' in r)) return null
  // keep our camera views / country outlines for known ids; take names + blurbs from the backend
  return (x as Obj[]).map((r) => {
    const local = REGIONS.find((l) => l.id === r.id)
    return {
      id: String(r.id), name: String(r.name),
      blurb: typeof r.blurb === 'string' ? r.blurb : '',
      center: isObj(r.center) ? { lat: num(r.center.lat), lng: num(r.center.lng), altitude: num(r.center.altitude, 1.4) } : (local?.center ?? { lat: 0, lng: 0, altitude: 2 }),
      countries: local?.countries ?? [],
    }
  })
}

export async function getRegions(): Promise<Region[]> {
  return live('regions', '/regions', normRegions)
}

/** regionId null/undefined = all regions (global view). Sends both `region` and `regionId` (backend uses the latter). */
export async function getCells(year: number, regionId?: string | null): Promise<FireCell[]> {
  // Always fetch the whole year once (cached) and filter here: the backend's region filter is by
  // country name, so asking it for "amazon" would return nothing.
  let p = yearCells.get(year)
  if (!p) {
    p = (async () => {
      await countryIndex()
      return live('cells', `/cells?year=${year}`, (x) => usableCells(normCells(x)))
    })()
    yearCells.set(year, p)
    p.catch(() => yearCells.delete(year)) // a failed load is retried next time, never cached
  }
  const all = await p
  return regionId ? all.filter((c) => c.regionId === regionId) : all
}
const yearCells = new Map<number, Promise<FireCell[]>>()

// ---- country names → our region ids ------------------------------------------
// The backend labels cells with a country name ("Brazil"). We map it onto our study regions
// via Natural Earth names (NAME / NAME_LONG / ADMIN / FORMAL_EN / ISO codes).
const norm = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
let countryIdx: Promise<Map<string, { code: string; name: string }>> | null = null
const featureByCode = new Map<string, Feature>()
function countryIndex() {
  return (countryIdx ??= fetch(`${import.meta.env.BASE_URL}data/countries.json`)
    .then((r) => r.json())
    .then((fc: { features: (Feature & { properties: Record<string, unknown> })[] }) => {
      const m = new Map<string, { code: string; name: string }>()
      for (const f of fc.features) {
        const p = f.properties, code = String(p.ADM0_A3), name = String(p.NAME)
        featureByCode.set(code, f)
        for (const k of ['NAME', 'NAME_LONG', 'ADMIN', 'FORMAL_EN', 'NAME_SORT', 'NAME_ALT', 'SOVEREIGNT', 'ADM0_A3', 'ISO_A2']) {
          const n = norm(p[k]); if (n && !m.has(n)) m.set(n, { code, name })
        }
      }
      return m
    })
    .catch(() => new Map()))
}
let idxCache: Map<string, { code: string; name: string }> = new Map()
void countryIndex().then((m) => { idxCache = m })

/** our country id for a backend label: an id as-is, else the entry with the same ISO code */
function toRegionId(label: string): string {
  if (REGIONS.some((r) => r.id === label)) return label
  const hit = idxCache.get(norm(label))
  return (hit && REGIONS.find((r) => r.countries.includes(hit.code))?.id) || label
}

/** GET /api/countries → our Region list: outline + camera view computed from the world map */
async function countriesToRegions(x: unknown): Promise<Region[] | null> {
  if (!Array.isArray(x) || !x.length) return null
  await countryIndex()
  const out: Region[] = []
  for (const row of x as Obj[]) {
    const id = String(row.id ?? row.name ?? '')
    const name = String(row.name ?? id)
    const hit = idxCache.get(norm(row.iso3 ?? row.code ?? '')) ?? idxCache.get(norm(id)) ?? idxCache.get(norm(name))
    const f = hit && featureByCode.get(hit.code)
    if (!id || !hit || !f) {
      console.warn('[thermora] country not on the map, skipped:', id)
      continue
    }
    const [lng, lat] = geoCentroid(f)
    const [[x0, y0], [x1, y1]] = geoBounds(f)
    const lngSpan = (x1 >= x0 ? x1 - x0 : x1 + 360 - x0) * Math.cos((lat * Math.PI) / 180)
    const span = Math.min(Math.max(y1 - y0, lngSpan), 60) // Russia/USA/islands: keep sane
    out.push({
      id, name,
      center: { lat: +lat.toFixed(1), lng: +lng.toFixed(1), altitude: +Math.min(1.9, Math.max(0.5, 0.35 + span / 38)).toFixed(2) },
      countries: [hit.code],
      blurb: '',
    })
  }
  return out.length ? out : null
}

/**
 * Cells as the backend sent them, with country names mapped to our ids. Nothing is rejected or
 * replaced (human null → -1 = "no score", see normCells).
 */
function usableCells(cells: FireCell[] | null): FireCell[] | null {
  if (!cells) return null
  return cells.map((c) => ({ ...c, regionId: toRegionId(c.regionId) }))
}

export async function getSummary(regionId: string, year: number): Promise<RegionSummary> {
  return live('summary', `/countries/${encodeURIComponent(regionId)}/summary?year=${year}`, (x) => normSummary(x, regionId, year))
}

/** Whole-dataset summary for a year (GET /api/summary?year), used for "Global view". */
export async function getGlobalSummary(year: number): Promise<RegionSummary> {
  return live('summary-global', `/summary?year=${year}`, (x) => normSummary(x, 'global', year))
}

/** Query string for a region or a place target. */
const targetQs = (t: Target) =>
  t.kind === 'region'
    ? `region=${encodeURIComponent(t.regionId)}`
    : `lat=${t.place.lat}&lng=${t.place.lng}&radiusKm=${t.place.radiusKm}`

/** "How much worse since the start of the record" for a region or a place. */
export async function getProgress(t: Target): Promise<ProgressSummary> {
  return live('progress', `/progress?${targetQs(t)}`, (x) => normProgress(x, t))
}

/** Every day of a year (for the calendar heatmap). */
export async function getDaily(t: Target, year: number): Promise<DailyPoint[]> {
  // country → region=<id>; place → lat/lng/radiusKm (the backend filters both). Days without fires are omitted.
  const list = await live('daily', `/daily?year=${year}&${targetQs(t)}`, normDaily)
  return [...list].sort((a, b) => a.date.localeCompare(b.date))
}

/** One day's detail (for the day card and day-vs-day comparison). date = YYYY-MM-DD */
export async function getDay(t: Target, date: string): Promise<DayDetail> {
  // The backend's /day returns only counts; derive the full card from the same daily series the
  // calendar shows (so numbers always agree), and the area's human likelihood from /progress.
  const year = +date.slice(0, 4)
  const [daily, prog] = await Promise.all([getDaily(t, year), getProgress(t).catch(() => null)])
  if (!prog) throw new Error('human likelihood unavailable')
  const wdOf = (d: string) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7
  const n = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 864e5
  const total = daily.reduce((s2, p) => s2 + p.harmonized, 0)
  const yearAvg = total / n || 1
  const wd = wdOf(date)
  const sameWd = daily.filter((p) => wdOf(p.date) === wd).reduce((s2, p) => s2 + p.harmonized, 0) / (n / 7) || 1
  const d = daily.find((p) => p.date === date) ?? { date, legacy: 0, harmonized: 0 }
  const rank = d.harmonized > 0 ? [...daily].sort((a, b) => b.harmonized - a.harmonized).findIndex((p) => p.date === date) + 1 : daily.length + 1
  useDataStatus.getState().mark('day', 'real')
  return {
    date, weekday: wd, isWeekend: wd >= 5,
    firesLegacy: d.legacy, firesHarmonized: d.harmonized,
    humanLikelihood: prog.humanLikelihood.harmonized,
    vsYearAvgPct: +(((d.harmonized - yearAvg) / yearAvg) * 100).toFixed(1),
    vsWeekdayAvgPct: +(((d.harmonized - sameWd) / sameWd) * 100).toFixed(1),
    rankInYear: rank,
  }
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
    ? { legacy: scoreOrNaN(hl.legacy), harmonized: scoreOrNaN(hl.harmonized) }
    : { legacy: scoreOrNaN(hl), harmonized: scoreOrNaN(hl) }
  const stats = isObj(hl) ? humanStats(hl.low, hl.high, hl.confidence, hl.scoredFires, hl.totalFires) : humanStats(null, null, null, null, null)
  const years = isObj(x.years)
    ? { first: num(x.years.first), last: num(x.years.last) }
    : { first: series[0]?.year ?? 2001, last: series[series.length - 1]?.year ?? 2025 }
  const name = typeof x.name === 'string' && x.name ? x.name : t.kind === 'place' ? t.place.name : (REGIONS.find((r) => r.id === t.regionId)?.name ?? t.regionId)
  return {
    name, years, series,
    baseline: num(x.baseline), recent: num(x.recent), changePct: change, direction,
    humanLikelihood: human,
    humanStats: stats,
    covered: x.covered === undefined ? series.some((p) => p.harmonized > 0) : Boolean(x.covered),
  }
}

function normDaily(x: unknown): DailyPoint[] | null {
  if (!Array.isArray(x)) return null
  if (x.length && !(isObj(x[0]) && 'date' in x[0])) return null
  return x.map((d: Obj) => ({ date: ymd(d.date), legacy: num(d.legacy), harmonized: num(d.harmonized, num(d.legacy)) }))
}

// (normDay removed: the day card is derived from /daily, see getDay)
