/**
 * MOCK DATA — deterministic, plausible-looking numbers so the UI can be built
 * before the backend is ready. NOT real science. The UI must show a "MOCK DATA"
 * badge while this is in use (see api.ts → USING_MOCK).
 */
import { geoBounds, geoContains } from 'd3-geo'
import type { FeatureCollection, Feature } from 'geojson'
import type { DailyPoint, DayDetail, FireCell, ProgressSummary, RegionSummary, Target, TrendPoint } from './types'
import { YEARS } from './types'
import { REGIONS } from './regions'

// ---- seeded RNG ---------------------------------------------------------
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
function rng(seed: string) {
  let a = hash(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r: () => number) => {
  const u = 1 - r(), v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ---- per-region "personality" (mock) -------------------------------------
const P: Record<string, { undercount: number; human: number; weekly: number; slope: number; size: number }> = {
  africa:      { undercount: 31, human: 0.71, weekly: 0.10, slope: -0.012, size: 1.0 },
  amazon:      { undercount: 19, human: 0.83, weekly: 0.14, slope: 0.004, size: 0.7 },
  seasia:      { undercount: 27, human: 0.78, weekly: 0.12, slope: -0.006, size: 0.6 },
  boreal_na:   { undercount: 9,  human: 0.22, weekly: 0.02, slope: 0.021, size: 0.35 },
  boreal_eu:   { undercount: 12, human: 0.31, weekly: 0.03, slope: 0.017, size: 0.5 },
  australia:   { undercount: 14, human: 0.44, weekly: 0.05, slope: 0.009, size: 0.5 },
  med:         { undercount: 22, human: 0.66, weekly: 0.09, slope: 0.006, size: 0.3 },
  india_china: { undercount: 41, human: 0.92, weekly: 0.19, slope: 0.011, size: 0.8 },
}

// ---- geometry ------------------------------------------------------------
let countriesP: Promise<FeatureCollection> | null = null
const loadCountries = () =>
  (countriesP ??= fetch(`${import.meta.env.BASE_URL}data/countries.json`).then((r) => r.json()))

export async function regionFeatures(regionId: string): Promise<Feature[]> {
  const fc = await loadCountries()
  const codes = REGIONS.find((r) => r.id === regionId)?.countries ?? []
  return fc.features.filter((f: Feature) => codes.includes(String(f.properties?.ADM0_A3)))
}

// Cached base cell layout per region (positions don't change by year)
const layoutCache = new Map<string, { lat: number; lng: number; w: number; small: number; human: number }[]>()

async function regionLayout(regionId: string) {
  if (layoutCache.has(regionId)) return layoutCache.get(regionId)!
  const feats = await regionFeatures(regionId)
  const fc: FeatureCollection = { type: 'FeatureCollection', features: feats }
  const [[x0, y0], [x1, y1]] = geoBounds(fc)
  const lngSpan = x1 >= x0 ? x1 - x0 : x1 + 360 - x0
  const r = rng('layout:' + regionId)
  const inside = (lng: number, lat: number) => feats.some((f) => geoContains(f, [lng, lat]))

  // pick cluster centres on land
  const centres: [number, number][] = []
  for (let i = 0; centres.length < 7 && i < 4000; i++) {
    const lng = ((x0 + r() * lngSpan + 540) % 360) - 180
    const lat = y0 + r() * (y1 - y0)
    if (inside(lng, lat)) centres.push([lng, lat])
  }
  const spread = Math.max(2, Math.min(9, lngSpan / 10))
  const cells: { lat: number; lng: number; w: number; small: number; human: number }[] = []
  const target = Math.round(150 * (P[regionId]?.size ?? 0.5) + 50)
  for (let i = 0; cells.length < target && i < target * 30; i++) {
    const c = centres[Math.floor(r() * centres.length)]
    if (!c) break
    const lng = ((c[0] + gauss(r) * spread + 540) % 360) - 180
    const lat = Math.max(-60, Math.min(75, c[1] + gauss(r) * spread * 0.6))
    if (!inside(lng, lat)) continue
    const small = r()
    // small-fire cells (crop/pasture burning) lean human; big remote fires lean natural
    const human = Math.min(0.98, Math.max(0.03, (P[regionId]?.human ?? 0.5) + (small - 0.5) * 0.45 + gauss(r) * 0.07))
    cells.push({ lat, lng, w: 0.3 + r() ** 2 * 3, small, human: +human.toFixed(2) })
  }
  layoutCache.set(regionId, cells)
  return cells
}

const yearFactor = (regionId: string, year: number) => {
  const p = P[regionId]
  const r = rng(`yr:${regionId}:${year}`)
  return Math.max(0.3, 1 + p.slope * (year - 2001) * 6 + gauss(r) * 0.12)
}

// ---- mock endpoints ------------------------------------------------------
export async function mockCells(year: number, regionId?: string | null): Promise<FireCell[]> {
  const ids = regionId ? [regionId] : REGIONS.map((r) => r.id)
  const out: FireCell[] = []
  for (const id of ids) {
    const layout = await regionLayout(id)
    const yf = yearFactor(id, year)
    const u = P[id].undercount / 100
    const r = rng(`cells:${id}:${year}`)
    for (const c of layout) {
      const legacy = Math.round(c.w * yf * 40 * (0.7 + r() * 0.6))
      // small-fire-heavy cells are undercounted more
      const harmonized = Math.round(legacy * (1 + u * (0.4 + c.small * 1.2)))
      out.push({ lat: c.lat, lng: c.lng, regionId: id, legacy, harmonized, human: c.human })
    }
  }
  return out
}

export async function mockSummary(regionId: string, year: number): Promise<RegionSummary> {
  const p = P[regionId]
  const cells = await mockCells(year, regionId)
  const firesLegacy = cells.reduce((s, c) => s + c.legacy, 0)
  const firesHarmonized = cells.reduce((s, c) => s + c.harmonized, 0)
  const undercountPct = ((firesHarmonized - firesLegacy) / firesLegacy) * 100

  const trend: TrendPoint[] = []
  for (let y = YEARS.min; y <= YEARS.max; y++) {
    const yf = yearFactor(regionId, y)
    const raw = +(yf * 100).toFixed(1)
    // correction matters more in early (MODIS-only) years
    const early = y < 2012 ? 1 : 0.6
    const corrected = +(raw * (1 + (p.undercount / 100) * early)).toFixed(1)
    const band = corrected * (y < 2012 ? 0.09 : 0.04)
    trend.push({ year: y, raw, corrected, lo: +(corrected - band).toFixed(1), hi: +(corrected + band).toFixed(1) })
  }
  const slope = (arr: number[]) => arr[arr.length - 1] - arr[0]
  const trendSurvives = Math.sign(slope(trend.map((t) => t.raw))) === Math.sign(slope(trend.map((t) => t.corrected)))

  const r = rng(`wk:${regionId}`)
  const base = firesHarmonized / 52 / 7
  // weekday rhythm: dip at weekend scaled by human "weekly" strength
  const shape = [1.02, 1.05, 1.06, 1.04, 1.0, 1 - p.weekly, 1 - p.weekly * 1.4]
  const weekdayCounts = shape.map((s) => Math.round(base * s * (1 + gauss(r) * 0.015)))

  const humanScore = { legacy: +(p.human - 0.06).toFixed(2), harmonized: p.human }
  const verdict = trendSurvives
    ? `Trend survives correction; human signal ${humanScore.harmonized > 0.6 ? 'strengthens' : 'stays weak'}.`
    : 'Raw trend does NOT survive correction — the legacy record misleads here.'

  return {
    regionId, year,
    undercountPct: +undercountPct.toFixed(1),
    undercountCi: [+(undercountPct * 0.82).toFixed(1), +(undercountPct * 1.18).toFixed(1)],
    firesLegacy, firesHarmonized, humanScore, weekdayCounts, trend, trendSurvives, verdict,
  }
}

// ---- places / calendar / progress mocks ------------------------------------

/** Fire-season peaks per region: [day-of-year, width in days, weight]. Rough real-world timing. */
const SEASON: Record<string, [number, number, number][]> = {
  africa: [[15, 35, 1], [220, 40, 1.1]],
  amazon: [[240, 30, 1]],
  seasia: [[75, 25, 1], [245, 30, 0.8]],
  boreal_na: [[200, 30, 1]],
  boreal_eu: [[130, 25, 0.7], [205, 30, 1]],
  australia: [[300, 45, 1]],
  med: [[215, 25, 1]],
  india_china: [[115, 20, 0.8], [305, 18, 1.2]],
}

const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function targetCells(t: Target, year: number) {
  if (t.kind === 'region') return mockCells(year, t.regionId)
  const all = await mockCells(year, null)
  return all.filter((c) => kmBetween(c, t.place) <= t.place.radiusKm)
}

const targetKey = (t: Target) => (t.kind === 'region' ? t.regionId : `${t.place.lat.toFixed(2)},${t.place.lng.toFixed(2)},${t.place.radiusKm}`)
const dominantRegion = (cells: FireCell[]) => {
  const n = new Map<string, number>()
  for (const c of cells) n.set(c.regionId, (n.get(c.regionId) ?? 0) + c.harmonized)
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
const weightedHuman = (cells: FireCell[]) => {
  const w = cells.reduce((s, c) => s + c.harmonized, 0)
  return w ? cells.reduce((s, c) => s + c.human * c.harmonized, 0) / w : 0
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export async function mockDaily(t: Target, year: number): Promise<DailyPoint[]> {
  const cells = await targetCells(t, year)
  const totL = cells.reduce((s, c) => s + c.legacy, 0)
  const totH = cells.reduce((s, c) => s + c.harmonized, 0)
  const regionId = t.kind === 'region' ? t.regionId : dominantRegion(cells)
  const peaks = SEASON[regionId ?? ''] ?? [[200, 40, 1]]
  const weekly = P[regionId ?? '']?.weekly ?? 0.05
  const r = rng(`daily:${targetKey(t)}:${year}`)
  const days: { date: string; w: number; wd: number }[] = []
  const start = Date.UTC(year, 0, 1)
  const n = (Date.UTC(year + 1, 0, 1) - start) / 864e5
  for (let i = 0; i < n; i++) {
    const d = new Date(start + i * 864e5)
    const wd = (d.getUTCDay() + 6) % 7 // Mon = 0
    let season = 0.04
    for (const [peak, width, weight] of peaks) {
      const dd = Math.min(Math.abs(i - peak), n - Math.abs(i - peak))
      season += weight * Math.exp(-0.5 * (dd / width) ** 2)
    }
    const weekFactor = wd === 5 ? 1 - weekly : wd === 6 ? 1 - weekly * 1.4 : 1 + weekly * 0.3
    days.push({ date: iso(d), w: season * weekFactor * Math.exp(gauss(r) * 0.35), wd })
  }
  const sw = days.reduce((s, d) => s + d.w, 0) || 1
  return days.map((d) => ({ date: d.date, legacy: Math.round((totL * d.w) / sw), harmonized: Math.round((totH * d.w) / sw) }))
}

export async function mockDay(t: Target, date: string): Promise<DayDetail> {
  const year = +date.slice(0, 4)
  const daily = await mockDaily(t, year)
  const i = daily.findIndex((d) => d.date === date)
  const d = daily[Math.max(0, i)]
  const wd = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7
  const yearAvg = daily.reduce((s, x) => s + x.harmonized, 0) / daily.length || 1
  const same = daily.filter((x) => (new Date(x.date + 'T00:00:00Z').getUTCDay() + 6) % 7 === wd)
  const wdAvg = same.reduce((s, x) => s + x.harmonized, 0) / (same.length || 1) || 1
  const rank = [...daily].sort((a, b) => b.harmonized - a.harmonized).findIndex((x) => x.date === date) + 1
  const cells = await targetCells(t, year)
  return {
    date, weekday: wd, isWeekend: wd >= 5,
    firesLegacy: d.legacy, firesHarmonized: d.harmonized,
    humanLikelihood: +weightedHuman(cells).toFixed(2),
    vsYearAvgPct: +(((d.harmonized - yearAvg) / yearAvg) * 100).toFixed(1),
    vsWeekdayAvgPct: +(((d.harmonized - wdAvg) / wdAvg) * 100).toFixed(1),
    rankInYear: rank,
  }
}

export async function mockProgress(t: Target): Promise<ProgressSummary> {
  const series: ProgressSummary['series'] = []
  let lastCells: FireCell[] = []
  for (let y = YEARS.min; y <= YEARS.max; y++) {
    const cells = await targetCells(t, y)
    lastCells = cells
    series.push({ year: y, legacy: cells.reduce((s, c) => s + c.legacy, 0), harmonized: cells.reduce((s, c) => s + c.harmonized, 0) })
  }
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1)
  const baseline = mean(series.slice(0, 3).map((x) => x.harmonized))
  const recent = mean(series.slice(-3).map((x) => x.harmonized))
  const changePct = baseline ? ((recent - baseline) / baseline) * 100 : 0
  const h = weightedHuman(lastCells)
  const name = t.kind === 'region' ? (REGIONS.find((r) => r.id === t.regionId)?.name ?? t.regionId) : t.place.name
  return {
    name,
    years: { first: YEARS.min, last: YEARS.max },
    series,
    baseline: Math.round(baseline),
    recent: Math.round(recent),
    changePct: +changePct.toFixed(1),
    direction: changePct > 10 ? 'worse' : changePct < -10 ? 'better' : 'stable',
    humanLikelihood: { legacy: +Math.max(0, h - 0.06).toFixed(2), harmonized: +h.toFixed(2) },
    covered: series.some((x) => x.harmonized > 0),
  }
}
