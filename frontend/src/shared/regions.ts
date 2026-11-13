/** The study regions (placeholder until the data team confirms the final list). */
import type { Region } from './types'

export const REGIONS: Region[] = [
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

export const regionById = (id: string | null) => REGIONS.find((r) => r.id === id) ?? null
