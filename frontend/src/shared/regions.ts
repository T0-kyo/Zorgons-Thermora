/**
 * The countries the app is organised by. Filled at startup from the backend's GET /api/countries
 * (see api.ts → syncRegions); empty until then, so only countries with real data are ever listed.
 * `countries` holds the Natural Earth ADM0_A3 code used for the outline and camera.
 */
import type { Region } from './types'

export const REGIONS: Region[] = []

export const regionById = (id: string | null) => REGIONS.find((r) => r.id === id) ?? null
/** the country entry for a Natural Earth ADM0_A3 code */
export const regionByCode = (code: string) => REGIONS.find((r) => r.countries.includes(code)) ?? null
