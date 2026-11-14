/**
 * SHARED — place search and click-to-place.
 * Offline gazetteer (public/data/places.json: Natural Earth populated places + known fire areas)
 * plus OpenStreetMap Nominatim when online. Never throws: falls back to coordinates.
 */
import { geoContains } from 'd3-geo'
import type { Place } from './types'
import { REGIONS } from './regions'
import { regionFeatures } from './geo'

interface GazetteerEntry { name: string; country: string; lat: number; lng: number }

const DEFAULT_RADIUS_KM = 150

let gazP: Promise<GazetteerEntry[]> | null = null
const gazetteer = () =>
  (gazP ??= fetch(`${import.meta.env.BASE_URL}data/places.json`)
    .then((r) => r.json() as Promise<GazetteerEntry[]>)
    .catch(() => [] as GazetteerEntry[]))

/** Which study region (if any) contains this point. */
export async function regionAt(lat: number, lng: number): Promise<string | null> {
  for (const r of REGIONS) {
    const feats = await regionFeatures(r.id)
    if (feats.some((f) => geoContains(f, [lng, lat]))) return r.id
  }
  return null
}

const fmtCoord = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`

async function toPlace(name: string, context: string, lat: number, lng: number, source: Place['source']): Promise<Place> {
  const regionId = await regionAt(lat, lng)
  const regionName = REGIONS.find((r) => r.id === regionId)?.name
  return {
    id: `${source}:${lat.toFixed(3)},${lng.toFixed(3)}`,
    name,
    context: regionName ? (context && context !== regionName ? `${context}, ${regionName}` : regionName) : context || 'Outside the countries with data',
    lat, lng,
    radiusKm: DEFAULT_RADIUS_KM,
    regionId,
    source,
  }
}

/** Search by name. Local matches first (instant, offline), then OpenStreetMap results if reachable. */
export async function searchPlaces(query: string, limit = 6): Promise<Place[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const local = (await gazetteer())
    .filter((p) => p.name.toLowerCase().includes(q) || p.country?.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
    .slice(0, limit)
  const results = await Promise.all(local.map((p) => toPlace(p.name, p.country, p.lat, p.lng, 'search')))

  if (results.length < limit && navigator.onLine) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 2500)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&accept-language=en&q=${encodeURIComponent(query)}`,
        { signal: ctrl.signal },
      )
      clearTimeout(t)
      const rows: { display_name: string; lat: string; lon: string }[] = await res.json()
      for (const row of rows) {
        const [name, ...rest] = row.display_name.split(', ')
        const lat = +row.lat, lng = +row.lon
        if (results.some((p) => Math.abs(p.lat - lat) < 0.2 && Math.abs(p.lng - lng) < 0.2)) continue
        results.push(await toPlace(name, rest.slice(-1)[0] ?? '', lat, lng, 'search'))
        if (results.length >= limit) break
      }
    } catch {
      /* offline or blocked: local results only */
    }
  }
  return results
}

/** A clicked point on the globe → nearest named place within ~250 km, else coordinates. */
export async function placeFromPoint(lat: number, lng: number): Promise<Place> {
  const rad = Math.PI / 180
  let best: GazetteerEntry | null = null, bestKm = 250
  for (const p of await gazetteer()) {
    const dLat = (p.lat - lat) * rad, dLng = (p.lng - lng) * rad
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(p.lat * rad) * Math.sin(dLng / 2) ** 2
    const km = 2 * 6371 * Math.asin(Math.sqrt(h))
    if (km < bestKm) { best = p; bestKm = km }
  }
  const name = best ? `Near ${best.name}` : fmtCoord(lat, lng)
  return toPlace(name, best ? best.country : '', lat, lng, 'click')
}
