/**
 * OWNER: Agent A. Full-screen 3D Earth.
 * Setup version: textured globe + auto-rotate + fly-to on region select.
 * Next (frontend/globe-*): real-time day/night shader, clouds, fire hexes, toggle animation.
 */
import { useEffect, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'

const GLOBAL_VIEW = { lat: 15, lng: 20, altitude: 2.4 }

export default function GlobeView() {
  const ref = useRef<GlobeMethods | undefined>(undefined)
  const regionId = useApp((s) => s.regionId)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // fly-to + auto-rotate only in global view
  useEffect(() => {
    const g = ref.current
    if (!g) return
    const region = regionById(regionId)
    const controls = g.controls()
    controls.autoRotate = !region
    controls.autoRotateSpeed = 0.35
    g.pointOfView(region ? region.center : GLOBAL_VIEW, 1600)
  }, [regionId])

  return (
    <Globe
      ref={ref}
      width={size.w}
      height={size.h}
      backgroundColor="#04060b"
      backgroundImageUrl="/textures/night-sky.png"
      globeImageUrl="/textures/earth-blue-marble.jpg"
      bumpImageUrl="/textures/earth-topology.png"
      showAtmosphere
      atmosphereColor="#5ad1ff"
      atmosphereAltitude={0.18}
      onGlobeReady={() => {
        const g = ref.current
        if (!g) return
        g.pointOfView(GLOBAL_VIEW, 0)
        g.controls().autoRotate = true
        g.controls().autoRotateSpeed = 0.35
      }}
    />
  )
}
