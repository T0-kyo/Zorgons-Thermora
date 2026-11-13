/**
 * OWNER: Agent A. Full-screen "real-time Earth".
 * - Day/night from the live sun position, city lights, drifting lit clouds, atmosphere
 * - Fire hexes from getCells(year); height/colour follow `mode`, animated on toggle
 * - Selected region: fly-to, glowing outline, other regions dimmed, pulsing rings on hottest cells
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import * as THREE from 'three'
import type { Feature } from 'geojson'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import { getCells } from '../shared/api'
import { regionFeatures } from '../shared/mock'
import { sunPosition } from '../shared/sun'
import type { FireCell, Mode } from '../shared/types'
import { makeCloudMaterial, makeEarthMaterial } from './earthMaterials'

const GLOBAL_VIEW = { lat: 18, lng: 20, altitude: 2.5 }
const INTRO_VIEW = { lat: 30, lng: -10, altitude: 4.2 }
const HEX_RES = 3
const MAX_HEX_ALT = 0.09

// token colours (keep in sync with index.css @theme)
const C = { fire: [255, 106, 43], hot: [255, 214, 130], missed: [255, 61, 129], cyan: '#5ad1ff' }

interface Hex {
  points: FireCell[]
  sumWeight: number
}

const weightFor = (mode: Mode) => (c: FireCell) =>
  mode === 'legacy' ? c.legacy : mode === 'harmonized' ? c.harmonized : c.harmonized - c.legacy

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

export default function GlobeView() {
  const ref = useRef<GlobeMethods | undefined>(undefined)
  const regionId = useApp((s) => s.regionId)
  const mode = useApp((s) => s.mode)
  const year = useApp((s) => s.year)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [cells, setCells] = useState<FireCell[]>([])
  const [outline, setOutline] = useState<Feature[]>([])

  // shared sun direction for earth + clouds shaders
  const sunDir = useMemo(() => new THREE.Vector3(1, 0, 0), [])
  const earthMaterial = useMemo(() => makeEarthMaterial(sunDir), [sunDir])

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ---- data ---------------------------------------------------------------
  useEffect(() => {
    let live = true
    getCells(year).then((c) => live && setCells(c))
    return () => { live = false }
  }, [year])

  useEffect(() => {
    let live = true
    if (regionId) regionFeatures(regionId).then((f) => live && setOutline(f))
    else setOutline([])
    return () => { live = false }
  }, [regionId])

  // scale references so heights are comparable across modes (legacy vs harmonized share one scale)
  const refs = useMemo(() => {
    const maxH = Math.max(1, ...cells.map((c) => c.harmonized))
    const maxD = Math.max(1, ...cells.map((c) => c.harmonized - c.legacy))
    return { abs: maxH * 2.2, diff: maxD * 2.2 }
  }, [cells])

  const hottest = useMemo(() => {
    const pool = regionId ? cells.filter((c) => c.regionId === regionId) : cells
    return [...pool].sort((a, b) => b.harmonized - a.harmonized).slice(0, regionId ? 6 : 10)
  }, [cells, regionId])

  // ---- camera -------------------------------------------------------------
  useEffect(() => {
    const g = ref.current
    if (!g) return
    const region = regionById(regionId)
    g.controls().autoRotate = !region
    g.pointOfView(region ? region.center : GLOBAL_VIEW, 1600)
  }, [regionId])

  const onReady = () => {
    const g = ref.current
    if (!g) return
    const controls = g.controls()
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.3
    controls.enableDamping = true
    controls.minDistance = g.getGlobeRadius() * 1.25
    controls.maxDistance = g.getGlobeRadius() * 6
    g.pointOfView(INTRO_VIEW, 0)
    setTimeout(() => g.pointOfView(regionById(useApp.getState().regionId)?.center ?? GLOBAL_VIEW, 2600), 150)

    // live sun
    const updateSun = () => {
      const s = sunPosition()
      const p = g.getCoords(s.lat, s.lng)
      sunDir.set(p.x, p.y, p.z).normalize()
    }
    updateSun()
    setInterval(updateSun, 30_000)

    // clouds
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(g.getGlobeRadius() * 1.007, 96, 96),
      makeCloudMaterial(sunDir),
    )
    clouds.rotation.y = -Math.PI / 2 // align with three-globe texture mapping
    g.scene().add(clouds)
    const spin = () => {
      clouds.rotation.y += 0.00006
      requestAnimationFrame(spin)
    }
    spin()
  }

  // ---- hex styling ----------------------------------------------------------
  const isDiff = mode === 'difference'
  // linear so the legacy→harmonized jump is honest and visible (same scale for both)
  const norm = (h: Hex) => Math.min(1, Math.max(0, h.sumWeight) / (isDiff ? refs.diff : refs.abs))
  const dimmed = (h: Hex) => regionId !== null && h.points[0]?.regionId !== regionId

  const hexColor = (h: Hex) => {
    const t = norm(h)
    const rgb = isDiff
      ? mix([150, 30, 80], C.missed, Math.sqrt(t))
      : mix(C.fire, C.hot, Math.min(1, Math.sqrt(t) * (mode === 'harmonized' ? 1.35 : 0.9)))
    const a = dimmed(h) ? 0.18 : 0.92
    return `rgba(${rgb.join(',')},${a})`
  }

  const ringColor = () => {
    const [r, g, b] = isDiff ? C.missed : C.fire
    return (t: number) => `rgba(${r},${g},${b},${(1 - t) * 0.9})`
  }

  return (
    <Globe
      ref={ref}
      width={size.w}
      height={size.h}
      animateIn={false}
      backgroundColor="#04060b"
      backgroundImageUrl={`${import.meta.env.BASE_URL}textures/night-sky.png`}
      globeMaterial={earthMaterial}
      showAtmosphere
      atmosphereColor={C.cyan}
      atmosphereAltitude={0.16}
      onGlobeReady={onReady}
      // fire hexes
      hexBinPointsData={cells}
      hexBinPointWeight={weightFor(mode) as (d: object) => number}
      hexBinResolution={HEX_RES}
      hexAltitude={(d) => 0.004 + norm(d as Hex) * MAX_HEX_ALT}
      hexTopColor={(d) => hexColor(d as Hex)}
      hexSideColor={(d) => hexColor(d as Hex)}
      hexMargin={0.18}
      hexTransitionDuration={900}
      hexLabel={(d) => {
        const h = d as Hex
        const leg = h.points.reduce((s, c) => s + c.legacy, 0)
        const har = h.points.reduce((s, c) => s + c.harmonized, 0)
        return `<div style="font:11px 'JetBrains Mono',monospace;background:rgba(10,15,26,.85);border:1px solid rgba(120,180,255,.2);padding:6px 8px;border-radius:4px;color:#e6edf7">
          legacy ${leg.toLocaleString()}<br/>harmonized ${har.toLocaleString()}<br/>
          <span style="color:#ff3d81">missed +${(har - leg).toLocaleString()}</span></div>`
      }}
      // selected region outline
      polygonsData={outline}
      polygonAltitude={0.006}
      polygonCapColor={() => 'rgba(90,209,255,0.05)'}
      polygonSideColor={() => 'rgba(90,209,255,0.15)'}
      polygonStrokeColor={() => C.cyan}
      polygonsTransitionDuration={600}
      // pulsing rings on hottest cells
      ringsData={hottest}
      ringColor={ringColor}
      ringMaxRadius={regionId ? 3.2 : 2.2}
      ringPropagationSpeed={1.6}
      ringRepeatPeriod={1100}
      ringAltitude={0.008}
    />
  )
}
