/**
 * OWNER: Agent B. The guided tour's shot list and voiceover lines (B8 + voiceover).
 *
 * Each line is one recorded clip: public/audio/tour/<id>.mp3. Lines that quote numbers are
 * built from the live data (api.ts), so the words recorded must match the data at record time.
 * The script sheet (#voiceover, Shift+V) prints the exact lines to record.
 */
import type { Mode } from '../../shared/types'
import { regionById } from '../../shared/regions'
import { weekendDip } from '../../charts/stats'
import { fetchSummary, fetchYearTotals } from '../data'

export type TourVariant = 'full' | 'short'
/** Data year the tour narrates. Change before recording if the team picks another year. */
export const TOUR_YEAR = 2019

export interface Shot {
  regionId: string | null
  mode: Mode
  /** Optional close-up (Agent A's camera hook). Omit to use the region's default view. */
  camera?: { lat: number; lng: number; altitude: number; ms?: number }
}

export interface Line {
  /** Clip file name without extension, e.g. "04" → public/audio/tour/04.mp3 */
  id: string
  shot: Shot
  /** Exactly what the narrator says. */
  text: string
  /** Shortest the step may last (gives the camera time to arrive). */
  minMs: number
}

/** Spoken numbers: whole numbers read better than "forty point five". */
const n = (v: number) => String(Math.round(Math.abs(v)))

const MODE_NAME: Record<Mode, string> = { legacy: 'Legacy (MODIS)', harmonized: 'Harmonized', difference: 'Missed fires' }
export const shotLabel = (s: Shot) => `${regionById(s.regionId)?.name ?? 'Global'}, ${MODE_NAME[s.mode]}${s.camera ? ', close-up' : ''}`

/** Close-up on the Indo-Gangetic plain, where crop-residue burning is densest. */
const PUNJAB = { lat: 28.5, lng: 78, altitude: 1.05, ms: 3000 }

export async function buildScript(variant: TourVariant, year = TOUR_YEAR): Promise<Line[]> {
  const [totals, ic, bna, af] = await Promise.all([
    fetchYearTotals(year),
    fetchSummary('india_china', year),
    fetchSummary('boreal_na', year),
    fetchSummary('africa', year),
  ])
  const dip = weekendDip(ic.weekdayCounts)
  const weekly =
    dip < -3
      ? `Nature has no weekends, yet these fires drop ${n(dip)} percent every weekend. That rhythm is a human fingerprint.`
      : `Nature has no weekends. Here the weekly rhythm is faint, with a human-influence score of ${ic.humanScore.harmonized.toFixed(1)}.`

  if (variant === 'short') {
    const weeklyShort = dip < -3 ? `And they drop ${n(dip)} percent at weekends. Nature has no weekends: that's a human fingerprint.` : weekly
    return [
      {
        id: 's1',
        shot: { regionId: null, mode: 'harmonized' },
        text: `NASA's two fire satellites disagree. Combine them, and Earth's fire record grows by ${n(totals.global.pct)} percent.`,
        minMs: 3000,
      },
      {
        id: 's2',
        shot: { regionId: 'india_china', mode: 'difference' },
        text: `In India and China's crop belts, the old record undercounts burning by ${n(ic.undercountPct)} percent.`,
        minMs: 3200,
      },
      { id: 's3', shot: { regionId: 'india_china', mode: 'harmonized', camera: PUNJAB }, text: weeklyShort, minMs: 3200 },
      {
        id: 's4',
        shot: { regionId: null, mode: 'difference' },
        text: 'The fire record undercounts small fires. Thermora shows where, and by how much.',
        minMs: 3000,
      },
    ]
  }

  return [
    {
      id: '01',
      shot: { regionId: null, mode: 'legacy' },
      text: "Since 2000, NASA's MODIS satellites have built Earth's long-term fire record. This is what it shows.",
      minMs: 3500,
    },
    {
      id: '02',
      shot: { regionId: null, mode: 'harmonized' },
      text: `Add VIIRS, a newer sensor that sees the small fires MODIS misses, and the record grows by ${n(totals.global.pct)} percent.`,
      minMs: 3500,
    },
    {
      id: '03',
      shot: { regionId: null, mode: 'difference' },
      text: 'Every magenta point is a fire the old record never counted.',
      minMs: 3500,
    },
    {
      id: '04',
      shot: { regionId: 'india_china', mode: 'difference' },
      text: `In India and China's crop belts, farmers burn small fields of stubble. The old record undercounts them by ${n(ic.undercountPct)} percent.`,
      minMs: 4000,
    },
    { id: '05', shot: { regionId: 'india_china', mode: 'harmonized', camera: PUNJAB }, text: weekly, minMs: 4000 },
    {
      id: '06',
      shot: { regionId: 'boreal_na', mode: 'harmonized' },
      text: `Compare Canada's boreal forest: remote, lightning-driven fires. The undercount here is just ${n(bna.undercountPct)} percent.`,
      minMs: 4000,
    },
    {
      id: '07',
      shot: { regionId: 'africa', mode: 'harmonized' },
      text: `Sub-Saharan Africa has more fire than anywhere on Earth. After correction, its long-term trend ${af.trendSurvives ? 'still holds' : 'reverses'}.`,
      minMs: 4000,
    },
    {
      id: '08',
      shot: { regionId: null, mode: 'difference' },
      text: 'The historical fire record undercounts small fires. Thermora shows where, by how much, and what it means.',
      minMs: 4000,
    },
  ]
}

/** On-screen caption: same words, with "21 percent" shown as "21%". */
export const captionOf = (text: string) => text.replace(/(\d+(?:\.\d+)?) percent/g, '$1%')

export const wordCount = (text: string) => text.trim().split(/\s+/).length
/** Calm narration pace ≈ 2.5 words/s (150 wpm). Used when no clip exists and to plan lengths. */
export const readingMs = (text: string) => Math.round((wordCount(text) / 2.5) * 1000 + 300)

/** Loose comparison so punctuation/case differences don't count as "changed". */
export const sameWords = (a: string, b: string) => {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim()
  return norm(a) === norm(b)
}
