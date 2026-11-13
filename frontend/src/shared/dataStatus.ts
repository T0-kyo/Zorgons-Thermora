/**
 * SHARED — live status of the backend connection, per endpoint.
 * The UI reads this to say honestly which numbers are real and which are still sample data.
 */
import { create } from 'zustand'

export type Backend = 'off' | 'checking' | 'up' | 'down'
/** per endpoint: 'real' = served by the backend, 'mock' = fallback sample data */
export type Source = 'real' | 'mock'

interface DataStatus {
  backend: Backend
  sources: Record<string, Source>
  setBackend: (b: Backend) => void
  mark: (endpoint: string, s: Source) => void
}

export const useDataStatus = create<DataStatus>((set) => ({
  backend: 'off',
  sources: {},
  setBackend: (backend) => set({ backend }),
  mark: (endpoint, s) => set((st) => (st.sources[endpoint] === s ? st : { sources: { ...st.sources, [endpoint]: s } })),
}))

/** true while anything currently on screen came from sample data */
export const anyMock = (sources: Record<string, Source>) =>
  Object.keys(sources).length === 0 || Object.values(sources).some((s) => s === 'mock')
