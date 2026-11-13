/**
 * Subsolar point (where the sun is directly overhead) for a given time.
 * Low-precision solar ephemeris — accurate to well under a degree, plenty for the globe.
 * Used by the globe's day/night shader; UI may use it for a "subsolar point" readout.
 */
const rad = Math.PI / 180

export function sunPosition(date: Date = new Date()): { lat: number; lng: number } {
  const d = date.getTime() / 864e5 + 2440587.5 - 2451545.0 // days since J2000
  const g = (357.529 + 0.98560028 * d) * rad // mean anomaly
  const q = 280.459 + 0.98564736 * d // mean longitude (deg)
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * rad // obliquity
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad // right ascension (deg)
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24 // hours
  let lng = ra - gmst * 15
  lng = ((((lng + 180) % 360) + 360) % 360) - 180
  return { lat: dec / rad, lng }
}
