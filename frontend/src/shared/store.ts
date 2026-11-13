/**
 * SHARED CONTRACT — global UI state. Both agents read/write through these actions.
 * Add fields freely; renaming/removing needs a note in frontend/TASKS.md.
 */
import { create } from 'zustand'
import type { Mode, Place } from './types'
import { YEARS } from './types'

interface AppState {
  /** null = global view (auto-rotating Earth). */
  regionId: string | null
  mode: Mode
  year: number
  /** Year playback running (timeline ▶). */
  playing: boolean
  /** Guided tour running. Any manual interaction should call stopTour(). */
  touring: boolean
  /**
   * Optional explicit camera target for the tour (B8). When set, the globe flies here
   * instead of the selected region's default view. Set back to null to release.
   * ms = flight duration (default 1600).
   */
  cameraTarget: { lat: number; lng: number; altitude: number; ms?: number } | null
  /** a specific place inside (or outside) a region, from search or a click on the globe */
  place: Place | null
  /** selected calendar day, YYYY-MM-DD (null = none). Its year should match `year`. */
  date: string | null
  /** days pinned for side-by-side comparison (max 3) */
  compareDates: string[]
  /** spectrum filter: only fires whose area human likelihood is within [lo, hi] are lit (0–1) */
  humanRange: [number, number]

  selectRegion: (id: string | null) => void
  setMode: (m: Mode) => void
  setYear: (y: number) => void
  setPlaying: (p: boolean) => void
  startTour: () => void
  stopTour: () => void
  setCameraTarget: (t: AppState['cameraTarget']) => void
  setPlace: (p: Place | null) => void
  setDate: (d: string | null) => void
  toggleCompare: (d: string) => void
  clearCompare: () => void
  setHumanRange: (r: [number, number]) => void
}

export const useApp = create<AppState>((set) => ({
  regionId: null,
  // the twist first: land directly in Human vs natural
  mode: 'human',
  year: 2019,
  playing: false,
  touring: false,
  cameraTarget: null,
  place: null,
  date: null,
  compareDates: [],
  humanRange: [0, 1],

  // changing region drops the place and any selected day
  selectRegion: (regionId) => set({ regionId, place: null, date: null, compareDates: [] }),
  setMode: (mode) => set({ mode }),
  setYear: (year) => set({ year: Math.min(YEARS.max, Math.max(YEARS.min, year)) }),
  setPlaying: (playing) => set({ playing }),
  startTour: () => set({ touring: true }),
  stopTour: () => set({ touring: false, cameraTarget: null }),
  setCameraTarget: (cameraTarget) => set({ cameraTarget }),
  // picking a place keeps (or adopts) its region so the region context stays on screen
  setPlace: (place) => set((st) => ({ place, regionId: place ? (place.regionId ?? st.regionId) : st.regionId, date: null })),
  setDate: (date) => set(() => (date ? { date, year: +date.slice(0, 4) } : { date: null })),
  toggleCompare: (d) =>
    set((st) => ({
      compareDates: st.compareDates.includes(d)
        ? st.compareDates.filter((x) => x !== d)
        : [...st.compareDates, d].slice(-3),
    })),
  clearCompare: () => set({ compareDates: [] }),
  setHumanRange: (r) => set({ humanRange: [Math.max(0, Math.min(r[0], r[1])), Math.min(1, Math.max(r[0], r[1]))] }),
}))

// Debug handle (handy for both agents + demo rehearsal): window.__thermora.getState() / .setState({ mode: 'human' })
;(globalThis as unknown as { __thermora?: typeof useApp }).__thermora = useApp
