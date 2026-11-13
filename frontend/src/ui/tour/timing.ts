/** OWNER: Agent B. Tour timing, shared by the runner and the script sheet so lengths always match. */
import type { Line, TourVariant } from './script'
import { readingMs, sameWords } from './script'
import type { Clip } from './voice'

/** Voice starts a beat after the shot changes, so the picture leads the words. */
export const LEAD_MS: Record<TourVariant, number> = { full: 550, short: 350 }
/** Breath between lines. */
export const GAP_MS: Record<TourVariant, number> = { full: 750, short: 450 }

/** The clip for a line, only if it was recorded with the line's current words. */
export const usableClip = (l: Line, clips: Map<string, Clip>) => {
  const c = clips.get(l.id)
  return c && sameWords(c.text, l.text) ? c : null
}

export interface Step {
  line: Line
  clip: Clip | null
  /** whole step, ms: max(minMs, lead + voice) + gap */
  ms: number
}

export function planSteps(lines: Line[], clips: Map<string, Clip>, v: TourVariant): Step[] {
  return lines.map((line) => {
    const clip = usableClip(line, clips)
    const voice = clip ? clip.duration * 1000 : readingMs(line.text)
    return { line, clip, ms: Math.max(line.minMs, LEAD_MS[v] + voice) + GAP_MS[v] }
  })
}
