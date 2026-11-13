/**
 * MOCK DATA — deterministic, plausible-looking numbers so the UI can be built
 * before the backend is ready. NOT real science. The UI must show a "MOCK DATA"
 * badge while this is in use (see api.ts → USING_MOCK).
 */
import { geoBounds, geoContains } from 'd3-geo'
import type { FeatureCollection, Feature } from 'geojson'
import type { FireCell, RegionSummary, TrendPoint } from './types'
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
const layoutCache = new Map<string, { lat: number; lng: number; w: number; small: number }[]>()

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
  const cells: { lat: number; lng: number; w: number; small: number }[] = []
  const target = Math.round(150 * (P[regionId]?.size ?? 0.5) + 50)
  for (let i = 0; cells.length < target && i < target * 30; i++) {
    const c = centres[Math.floor(r() * centres.length)]
    if (!c) break
    const lng = ((c[0] + gauss(r) * spread + 540) % 360) - 180
    const lat = Math.max(-60, Math.min(75, c[1] + gauss(r) * spread * 0.6))
    if (!inside(lng, lat)) continue
    cells.push({ lat, lng, w: 0.3 + r() ** 2 * 3, small: r() })
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
      out.push({ lat: c.lat, lng: c.lng, regionId: id, legacy, harmonized })
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
