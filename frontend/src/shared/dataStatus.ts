/**
 * SHARED — live status of the backend connection, per endpoint.
 * The UI reads this to say whether the backend answered.
 */
import { create } from 'zustand'

/** checking: first try · waking: server is starting (can take minutes) · down: still not answering after ~5 min (we keep trying) */
export type Backend = 'checking' | 'waking' | 'up' | 'down'
/** per endpoint: 'real' = served by the backend, 'error' = unavailable (nothing is shown in its place) */
export type Source = 'real' | 'error'

interface DataStatus {
  backend: Backend
  sources: Record<string, Source>
  /** bumps when the region list is replaced by the backend's, so the UI re-renders */
  regionsVersion: number
  /** when we started waiting for the server (ms), for the "waking up" timer */
  wakingSince: number | null
  setBackend: (b: Backend, since?: number) => void
  mark: (endpoint: string, s: Source) => void
}

export const useDataStatus = create<DataStatus>((set) => ({
  backend: 'checking',
  sources: {},
  regionsVersion: 0,
  wakingSince: null,
  setBackend: (backend, since) => set({ backend, wakingSince: since ?? null }),
  mark: (endpoint, s) => set((st) => (st.sources[endpoint] === s ? st : { sources: { ...st.sources, [endpoint]: s } })),
}))

/** true when any endpoint on screen failed */
export const anyFailed = (sources: Record<string, Source>) => Object.values(sources).some((s) => s === 'error')
