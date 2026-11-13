/** OWNER: Agent B. B7 — steps `year` every 1.2s while `playing`. */
import { useEffect } from 'react'
import { useApp } from '../shared/store'
import { YEARS } from '../shared/types'

const STEP_MS = 1200

/** Drives playback. Mounted once (in App) so it runs on desktop and mobile alike. */
export function usePlayback() {
  const playing = useApp((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      const { year, setYear, setPlaying } = useApp.getState()
      if (year >= YEARS.max) setPlaying(false)
      else setYear(year + 1)
    }, STEP_MS)
    return () => clearInterval(t)
  }, [playing])
}
