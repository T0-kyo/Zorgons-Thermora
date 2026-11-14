/**
 * SHARED CONTRACT — data shapes used by both the globe (Agent A) and the UI (Agent B).
 * Mirrors the backend API draft. Change only with a note in frontend/TASKS.md.
 */

/**
 * Which view of the fire record is shown.
 * - legacy: original MODIS record
 * - harmonized: corrected record
 * - human: harmonized fires coloured by how likely they are human-driven (natural → human)
 * - difference: (deprecated in the UI, still supported by the globe) only the fires the legacy record missed
 */
export type Mode = 'legacy' | 'harmonized' | 'human' | 'difference'

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
  /**
   * Average human-association score (0–1) of the scored fires in this cell (science team).
   * -1 = no scored fires ("no score"). Describes the AREA, not any single fire.
   */
  human: number
  /** average 95% interval bounds of the scored fires (NaN when none) */
  humanLow?: number
  humanHigh?: number
  /** most common confidence level among the scored fires */
  confidence?: ConfidenceLevel | null
  scoredFires?: number
}

export type ConfidenceLevel = 'low' | 'medium' | 'high'

/**
 * The evidence behind an area's human score (science team, via the backend).
 * NaN / null = the backend has no value; nothing is ever filled in.
 */
export interface HumanStats {
  /** average of the scored fires' 95% interval bounds */
  low: number
  high: number
  /** fires per confidence level ("confidence in the human score", not the detection) */
  counts: Record<ConfidenceLevel, number> | null
  /** the level most scored fires have */
  confidence: ConfidenceLevel | null
  scoredFires: number
  /** all fires in the area (NaN when the backend doesn't say) */
  totalFires: number
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
  /** Average human-association score (0–1) of scored fires; NaN = no score. */
  humanScore: { legacy: number; harmonized: number }
  /** range, confidence and coverage behind humanScore.harmonized */
  humanStats: HumanStats
  /** Mean detections by weekday, Monday first (7 values). */
  weekdayCounts: number[]
  trend: TrendPoint[]
  /** Does the raw trend's direction survive the correction? */
  trendSurvives: boolean
  /** Human-readable verdict line. */
  verdict: string
}

/** year range on the slider; narrowed at startup to the years the backend has (GET /api/meta) */
export const YEARS: { min: number; max: number } = { min: 2001, max: 2025 }

// ---- places, calendar, progress (added for the place search + calendar features) ----

/** A specific spot the user searched for or clicked. Fires are aggregated within radiusKm. */
export interface Place {
  id: string
  name: string
  /** e.g. country, or "Amazon Basin" */
  context: string
  lat: number
  lng: number
  radiusKm: number
  /** study region this place falls in, or null if outside all regions */
  regionId: string | null
  source: 'search' | 'click'
}

/** What the calendar/progress panel is looking at: a whole region, or a place inside/outside one. */
export type Target = { kind: 'region'; regionId: string } | { kind: 'place'; place: Place }

/** "How much worse has it been getting since the start of the record?" GET /places/summary */
export interface ProgressSummary {
  name: string
  years: { first: number; last: number }
  /** yearly harmonized (and legacy) fire counts for the sparkline */
  series: { year: number; legacy: number; harmonized: number }[]
  /** mean harmonized fires/yr over the first and last 3 years */
  baseline: number
  recent: number
  /** (recent - baseline) / baseline × 100 */
  changePct: number
  direction: 'worse' | 'better' | 'stable'
  /** area-level likelihood of human-driven fire (0–1), legacy vs corrected record */
  humanLikelihood: { legacy: number; harmonized: number }
  /** range, confidence and coverage behind humanLikelihood.harmonized */
  humanStats: HumanStats
  /** false when the place is outside every study region (no data) */
  covered: boolean
}

/** One calendar day. GET /daily?year=&region= | &lat=&lng=&radiusKm= */
export interface DailyPoint {
  /** YYYY-MM-DD */
  date: string
  legacy: number
  harmonized: number
}

/** Everything the day card shows. GET /day?date=&region= | &lat=&lng=&radiusKm= */
export interface DayDetail {
  date: string
  /** 0 = Monday … 6 = Sunday (local solar time) */
  weekday: number
  isWeekend: boolean
  firesLegacy: number
  firesHarmonized: number
  /** area likelihood of human-driven fire; the same for every day, shown for context */
  humanLikelihood: number
  /** this day vs the year's daily average, % */
  vsYearAvgPct: number
  /** this day vs the average of the same weekday that year, % */
  vsWeekdayAvgPct: number
  /** rank of the day in its year by harmonized fires (1 = most fires) */
  rankInYear: number
}
