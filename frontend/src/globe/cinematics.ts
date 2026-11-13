/**
 * OWNER: Agent A. TRIAL — cinematic camera moves for the globe.
 * - swoopTo: pull back, arc over, dive in (instead of a flat pan)
 * - sunriseIntro: open on the night side from deep space, glide into daylight
 * - fitAltitude: back the camera off on tall/narrow screens so the globe isn't cropped
 * - drift: slow orbit while a region is in focus, cancelled by any manual drag
 */
import type { GlobeMethods } from 'react-globe.gl'

export interface View { lat: number; lng: number; altitude: number }

let timers: number[] = []
const clearTimers = () => { timers.forEach(clearTimeout); timers = [] }

/** Narrow/portrait screens need more distance to keep the whole globe in frame. */
let viewAspect = window.innerWidth / Math.max(1, window.innerHeight)
/** The globe's own box aspect (set by GlobeView when its container resizes). */
export function setViewAspect(a: number) { viewAspect = a }

export function fitAltitude(v: View): View {
  const aspect = viewAspect
  const k = aspect >= 1.2 ? 1 : aspect >= 0.8 ? 1.25 : 1.7
  return { ...v, altitude: v.altitude * k }
}

const wrapLng = (l: number) => ((((l + 180) % 360) + 360) % 360) - 180

/** Great-circle-ish midpoint good enough for camera paths. */
function midpoint(a: View, b: View) {
  let dl = b.lng - a.lng
  if (dl > 180) dl -= 360
  if (dl < -180) dl += 360
  return { lat: (a.lat + b.lat) / 2, lng: wrapLng(a.lng + dl / 2), dist: Math.hypot(b.lat - a.lat, dl) }
}

/**
 * Familiarity: the first flight is fully cinematic; every next one is quicker and arcs less,
 * until it's a fast, direct glide (no zoom-out). Resets after a few idle minutes.
 * The guided tour (demo video) always gets the full cinematic version.
 */
let flights = 0
let lastFlight = 0
const RESET_AFTER_MS = 3 * 60_000
function familiarity(cinematic: boolean) {
  const now = performance.now()
  if (now - lastFlight > RESET_AFTER_MS) flights = 0
  lastFlight = now
  if (cinematic) return { speed: 1, arc: 1 }
  const n = flights++
  return {
    speed: Math.max(0.28, Math.pow(0.7, n)), // 1, .70, .49, .34, .28 …
    arc: Math.max(0, 1 - n * 0.4), // full arc, 60%, 20%, then none
  }
}

/** Pull back, arc over the planet, dive into the target. Short hops stay a single glide. */
export function swoopTo(g: GlobeMethods, target: View, ms = 2600, opts: { cinematic?: boolean } = {}) {
  clearTimers()
  const { speed, arc } = familiarity(!!opts.cinematic)
  const dur = Math.max(600, ms * speed)
  const t = fitAltitude(target)
  const cur = g.pointOfView() as View
  const m = midpoint(cur, t)
  const lift = Math.min(1.6, 0.5 + m.dist / 120) * arc // farther hops climb higher, less once familiar
  if (m.dist < 25 || lift < 0.15) {
    g.pointOfView(t, dur * 0.75)
    return
  }
  const apex = { lat: m.lat, lng: m.lng, altitude: Math.max(cur.altitude, t.altitude) + lift }
  g.pointOfView(apex, dur * 0.45)
  timers.push(window.setTimeout(() => g.pointOfView(t, dur * 0.55), dur * 0.45))
}

/** Open from deep space on the night side, then glide into daylight at the final view. */
export function sunriseIntro(g: GlobeMethods, sun: { lat: number; lng: number }, final: View) {
  clearTimers()
  const start = { lat: sun.lat * 0.5 + 12, lng: wrapLng(sun.lng + 150), altitude: 7 }
  const mid = { lat: start.lat, lng: wrapLng(sun.lng + 75), altitude: 4.2 } // over the terminator
  g.pointOfView(start, 0)
  timers.push(window.setTimeout(() => g.pointOfView(mid, 2600), 120))
  timers.push(window.setTimeout(() => g.pointOfView(fitAltitude(final), 2600), 2750))
}

/** Slow orbit around the focused region; any manual drag stops it until the next selection. */
export function setDrift(g: GlobeMethods, on: boolean) {
  const c = g.controls()
  c.autoRotate = on
  c.autoRotateSpeed = on ? 0.12 : 0.3
}
