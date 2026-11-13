/**
 * SHARED CONTRACT — the only place the app talks to data.
 * Set VITE_API_URL to use the real backend; otherwise mocks are served.
 * Components must call these functions, never fetch() directly.
 */
import type { FireCell, Region, RegionSummary } from './types'
import { REGIONS } from './regions'
import { mockCells, mockSummary } from './mock'

const API = import.meta.env.VITE_API_URL as string | undefined
export const USING_MOCK = !API

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json()
}

export async function getRegions(): Promise<Region[]> {
  return USING_MOCK ? REGIONS : get('/regions')
}

/** regionId null/undefined = all regions (global view). */
export async function getCells(year: number, regionId?: string | null): Promise<FireCell[]> {
  if (USING_MOCK) return mockCells(year, regionId)
  return get(`/cells?year=${year}${regionId ? `&region=${regionId}` : ''}`)
}

export async function getSummary(regionId: string, year: number): Promise<RegionSummary> {
  if (USING_MOCK) return mockSummary(regionId, year)
  return get(`/regions/${regionId}/summary?year=${year}`)
}
