/**
 * SHARED CONTRACT — data shapes used by both the globe (Agent A) and the UI (Agent B).
 * Mirrors the backend API draft. Change only with a note in frontend/TASKS.md.
 */

/** Which version of the fire record is shown. */
export type Mode = 'legacy' | 'harmonized' | 'difference'

export interface Region {
  id: string
  name: string
  /** Camera target for the fly-to. altitude is in globe radii (≈0.8 close, 2.5 far). */
  center: { lat: number; lng: number; altitude: number }
  /** Natural Earth ADM0_A3 codes used to draw the region outline (mock only). */
  countries: string[]
  /** One-line context shown in the UI. */
  blurb: string
}

/**
 * One aggregated grid cell of vegetation-fire detections for a year.
 * GET /cells?year=&region=   (region omitted = all regions)
 * Both versions come in one response so the toggle can animate without refetching.
 * missed = harmonized - legacy (what the old record undercounts).
 */
export interface FireCell {
  lat: number
  lng: number
  regionId: string
  legacy: number
  harmonized: number
}

export interface TrendPoint {
  year: number
  /** Annual fire activity index from the raw MODIS record. */
  raw: number
  /** Same, after the MODIS→VIIRS correction. */
  corrected: number
  /** Uncertainty band on the corrected value. */
  lo: number
  hi: number
}

/** GET /regions/:id/summary?year= */
export interface RegionSummary {
  regionId: string
  year: number
  /** % of fires the legacy record misses vs harmonized. */
  undercountPct: number
  undercountCi: [number, number]
  firesLegacy: number
  firesHarmonized: number
  /** Probability (0–1) that fire activity is human-driven, from the weekly-cycle test. */
  humanScore: { legacy: number; harmonized: number }
  /** Mean detections by weekday, Monday first (7 values). */
  weekdayCounts: number[]
  trend: TrendPoint[]
  /** Does the raw trend's direction survive the correction? */
  trendSurvives: boolean
  /** Human-readable verdict line. */
  verdict: string
}

export const YEARS = { min: 2001, max: 2025 } as const
