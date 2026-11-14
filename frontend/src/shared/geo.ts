/** Country outlines (Natural Earth, public/data/countries.json): geometry only, no data. */
import type { FeatureCollection, Feature } from 'geojson'
import { REGIONS } from './regions'

let countriesP: Promise<FeatureCollection> | null = null
const loadCountries = () =>
  (countriesP ??= fetch(`${import.meta.env.BASE_URL}data/countries.json`).then((r) => r.json()))

/** the outline features of one country in the current list */
export async function regionFeatures(regionId: string): Promise<Feature[]> {
  const fc = await loadCountries()
  const codes = REGIONS.find((r) => r.id === regionId)?.countries ?? []
  return fc.features.filter((f: Feature) => codes.includes(String(f.properties?.ADM0_A3)))
}
