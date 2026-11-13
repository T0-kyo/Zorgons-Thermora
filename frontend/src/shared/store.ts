/**
 * SHARED CONTRACT — global UI state. Both agents read/write through these actions.
 * Add fields freely; renaming/removing needs a note in frontend/TASKS.md.
 */
import { create } from 'zustand'
import type { Mode } from './types'
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

  selectRegion: (id: string | null) => void
  setMode: (m: Mode) => void
  setYear: (y: number) => void
  setPlaying: (p: boolean) => void
  startTour: () => void
  stopTour: () => void
  setCameraTarget: (t: AppState['cameraTarget']) => void
}

export const useApp = create<AppState>((set) => ({
  regionId: null,
  mode: 'legacy',
  year: 2019,
  playing: false,
  touring: false,
  cameraTarget: null,

  selectRegion: (regionId) => set({ regionId }),
  setMode: (mode) => set({ mode }),
  setYear: (year) => set({ year: Math.min(YEARS.max, Math.max(YEARS.min, year)) }),
  setPlaying: (playing) => set({ playing }),
  startTour: () => set({ touring: true }),
  stopTour: () => set({ touring: false, cameraTarget: null }),
  setCameraTarget: (cameraTarget) => set({ cameraTarget }),
}))
