/**
 * The places the app is organised by: COUNTRIES (team decision, Sat 10:10).
 * At startup this default list is replaced in place by the backend's GET /api/countries
 * (see api.ts → syncRegions), so ids always equal the backend's country labels.
 * `countries` holds the Natural Earth ADM0_A3 code used for the outline.
 */
import type { Region } from './types'

const c = (id: string, code: string, lat: number, lng: number, altitude: number, blurb = ''): Region => ({
  id, name: id, center: { lat, lng, altitude }, countries: [code], blurb,
})

/** Default demo countries (used until / unless the backend serves its own list). */
export const REGIONS: Region[] = [
  c('Brazil', 'BRA', -10.8, -53.1, 1.38, 'Amazon deforestation and pasture fires.'),
  c('Bolivia', 'BOL', -16.7, -64.6, 0.7, 'Dry-season clearing at the Amazon edge.'),
  c('Indonesia', 'IDN', -0.3, 114.0, 0.61, 'Peatland and plantation burning.'),
  c('India', 'IND', 22.9, 79.6, 1.07, 'Crop-residue burning: small fires, strong human rhythm.'),
  c('China', 'CHN', 36.6, 103.9, 1.65, 'Agricultural burning on the plains.'),
  c('Russia', 'RUS', 61.7, 99.2, 1.9, 'Siberian taiga: vast, remote, lightning-prone.'),
  c('Canada', 'CAN', 57.7, -101.6, 1.55, 'Boreal forest fires, mostly lightning.'),
  c('Australia', 'AUS', -25.6, 134.4, 1.31, 'Savanna burning and south-east megafires.'),
  c('Dem. Rep. Congo', 'COD', -2.9, 23.6, 0.85, 'Savanna and cropland fires.'),
  c('Angola', 'AGO', -12.3, 17.5, 0.67, 'Among the most fire-active countries on Earth.'),
  c('Egypt', 'EGY', 26.5, 29.8, 0.64, 'Rice-straw burning in the Nile Delta.'),
  c('Greece', 'GRC', 39.3, 22.6, 0.5, 'Summer wildfires at the wildland–urban edge.'),
  c('United States of America', 'USA', 39.5, -99.1, 1.52, 'Western wildfires and prescribed burns.'),
  c('Mexico', 'MEX', 23.9, -102.6, 1.08, 'Dry-season agricultural and forest fires.'),
  c('Kazakhstan', 'KAZ', 48.2, 67.3, 1.07, 'Steppe grassland fires.'),
]

/** Default blurbs by ISO code, reused when the backend list replaces REGIONS. */
export const BLURBS: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.countries[0], r.blurb]))

export const regionById = (id: string | null) => REGIONS.find((r) => r.id === id) ?? null
/** the country entry for a Natural Earth ADM0_A3 code */
export const regionByCode = (code: string) => REGIONS.find((r) => r.countries.includes(code)) ?? null
/** which original biome a country belongs to (sample-data personality), if any */
export const biomeOfCode = (code: string) => BIOMES.find((b) => b.countries.includes(code))?.id ?? null

/**
 * BIOMES: the original 8 study areas. No longer shown in the UI (the team switched to countries);
 * kept only to give sample data a realistic character per country (fire season, human share…).
 */
export const BIOMES: Region[] = [
  {
    id: 'africa',
    name: 'Sub-Saharan Africa',
    center: { lat: 0, lng: 22, altitude: 1.6 },
    countries: ['AGO', 'COD', 'COG', 'CAF', 'CMR', 'TCD', 'SDS', 'ETH', 'KEN', 'TZA', 'UGA', 'ZMB', 'ZWE', 'MOZ', 'MWI', 'MDG', 'NGA', 'GHA', 'CIV', 'BFA', 'MLI', 'GIN', 'SEN', 'SLE', 'LBR', 'BEN', 'TGO', 'GAB', 'RWA', 'BDI', 'NAM', 'BWA', 'ZAF'],
    blurb: 'Savanna burning — the largest share of Earth’s fires.',
  },
  {
    id: 'amazon',
    name: 'Amazon Basin',
    center: { lat: -7, lng: -60, altitude: 1.35 },
    countries: ['BRA', 'PER', 'BOL', 'COL', 'VEN', 'ECU', 'GUY', 'SUR', 'PRY'],
    blurb: 'Deforestation fires and pasture clearing.',
  },
  {
    id: 'seasia',
    name: 'Southeast Asia',
    center: { lat: 6, lng: 110, altitude: 1.4 },
    countries: ['IDN', 'MYS', 'THA', 'VNM', 'KHM', 'LAO', 'MMR', 'PHL', 'BRN', 'TLS', 'PNG'],
    blurb: 'Peatland and plantation burning.',
  },
  {
    id: 'boreal_na',
    name: 'Boreal North America',
    center: { lat: 58, lng: -108, altitude: 1.6 },
    countries: ['CAN'],
    blurb: 'Lightning-driven forest fires, growing in size.',
  },
  {
    id: 'boreal_eu',
    name: 'Boreal Eurasia',
    center: { lat: 60, lng: 100, altitude: 1.8 },
    countries: ['RUS', 'FIN', 'SWE', 'NOR'],
    blurb: 'Siberian taiga — remote, vast, under-observed.',
  },
  {
    id: 'australia',
    name: 'Australia',
    center: { lat: -25, lng: 134, altitude: 1.3 },
    countries: ['AUS'],
    blurb: 'Northern savanna and south-east forest megafires.',
  },
  {
    id: 'med',
    name: 'Mediterranean',
    center: { lat: 38, lng: 16, altitude: 1.3 },
    countries: ['ESP', 'PRT', 'FRA', 'ITA', 'GRC', 'TUR', 'MAR', 'DZA', 'TUN', 'HRV', 'ALB', 'CYP', 'ISR', 'LBN'],
    blurb: 'Summer wildfires at the wildland–urban edge.',
  },
  {
    id: 'india_china',
    name: 'India & China crop belts',
    center: { lat: 27, lng: 92, altitude: 1.6 },
    countries: ['IND', 'CHN', 'PAK', 'BGD', 'NPL'],
    blurb: 'Crop-residue burning — small fires, strong human rhythm.',
  },
]

