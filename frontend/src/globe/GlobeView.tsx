/**
 * OWNER: Agent A. Full-screen "real-time Earth".
 * - Day/night from the live sun position, city lights, drifting lit clouds, atmosphere
 * - Fire hexes from getCells(year); height/colour follow `mode`, animated on toggle
 * - Selected region: fly-to, glowing outline, only that region's hexes, pulsing rings on hottest cells
 *
 * Performance notes (keep it smooth on weak laptops):
 * - every hex is its own mesh → keep hex count low: coarse H3 res in global view,
 *   and only the selected region's cells when zoomed in
 * - opaque colours (no transparency sorting), pixel ratio capped at 1.5
 * - accessors memoised so React re-renders don't re-aggregate the hex layer
 * - rendering pauses when the tab is hidden
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import * as THREE from 'three'
import { latLngToCell } from 'h3-js'
import type { Feature } from 'geojson'
import { useApp } from '../shared/store'
import { regionById } from '../shared/regions'
import { getCells, placeFromPoint } from '../shared/api'
import { regionFeatures } from '../shared/mock'
import { sunPosition } from '../shared/sun'
import type { FireCell, Mode } from '../shared/types'
import { YEARS } from '../shared/types'
import { makeCloudMaterial, makeEarthMaterial } from './earthMaterials'
import { FireGlow } from './FireGlow'
import { fitAltitude, setDrift, sunriseIntro, swoopTo } from './cinematics'

/** 'glow' = flickering ember points (default, one draw call). 'hex' = 3D hex columns (fallback). */
const FIRE_STYLE: 'glow' | 'hex' = 'glow'

const GLOBAL_VIEW = { lat: 18, lng: 20, altitude: 2.5 }
const RES_GLOBAL = 2
const RES_REGION = 3
const MAX_HEX_ALT = { global: 0.07, region: 0.09 }

// token colours (keep in sync with index.css @theme)
const C = { fire: [255, 62, 18], hot: [255, 186, 96], missedLo: [150, 30, 80], missed: [255, 61, 129], natural: [143, 211, 232], cyan: '#8fd3e8' }

interface Hex {
  points: FireCell[]
  sumWeight: number
}

const value = (mode: Mode, c: FireCell) =>
  mode === 'legacy' ? c.legacy : mode === 'harmonized' ? c.harmonized : c.harmonized - c.legacy

const rgb = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`

/** Max hex sums at a resolution, so heights share one honest scale across legacy/harmonized. */
function hexMaxima(cells: FireCell[], res: number) {
  const h = new Map<string, { harm: number; diff: number }>()
  for (const c of cells) {
    const k = latLngToCell(c.lat, c.lng, res)
    const e = h.get(k) ?? { harm: 0, diff: 0 }
    e.harm += c.harmonized
    e.diff += c.harmonized - c.legacy
    h.set(k, e)
  }
  let harm = 1, diff = 1
  for (const e of h.values()) {
    harm = Math.max(harm, e.harm)
    diff = Math.max(diff, e.diff)
  }
  return { abs: harm * 1.05, diff: diff * 1.05 }
}

export default function GlobeView() {
  const ref = useRef<GlobeMethods | undefined>(undefined)
  const regionId = useApp((s) => s.regionId)
  const mode = useApp((s) => s.mode)
  const year = useApp((s) => s.year)
  const playing = useApp((s) => s.playing)
  const cameraTarget = useApp((s) => s.cameraTarget)
  const place = useApp((s) => s.place)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [allCells, setAllCells] = useState<FireCell[]>([])
  const [outline, setOutline] = useState<Feature[]>([])
  const [ready, setReady] = useState(false)
  const glow = useMemo(() => (FIRE_STYLE === 'glow' ? new FireGlow(C) : null), [])

  // shared sun direction for earth + clouds shaders
  const sunDir = useMemo(() => new THREE.Vector3(1, 0, 0), [])
  const earthMaterial = useMemo(() => makeEarthMaterial(sunDir), [sunDir])

  useEffect(() => {
    let t: number | undefined
    const onResize = () => {
      clearTimeout(t)
      t = window.setTimeout(() => setSize({ w: window.innerWidth, h: window.innerHeight }), 120)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // keyboard shortcut (until the toggle has the button): H = Human vs natural on/off
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'h' || e.key === 'H') {
        const st = useApp.getState()
        st.setMode(st.mode === 'human' ? 'harmonized' : 'human')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // pause rendering when the tab is hidden
  useEffect(() => {
    const onVis = () => {
      const g = ref.current
      if (!g) return
      if (document.hidden) g.pauseAnimation()
      else g.resumeAnimation()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ---- data ---------------------------------------------------------------
  // per-year cache + prefetch of neighbours so playback never waits on the network
  const yearCache = useRef(new Map<number, Promise<FireCell[]>>())
  const cellsFor = useCallback((y: number) => {
    const cache = yearCache.current
    if (!cache.has(y)) cache.set(y, getCells(y).catch((e) => { cache.delete(y); throw e }))
    return cache.get(y)!
  }, [])

  useEffect(() => {
    let live = true
    cellsFor(year).then((c) => live && setAllCells(c)).catch(() => {})
    for (const n of [year + 1, year + 2, year - 1]) {
      if (n >= YEARS.min && n <= YEARS.max) cellsFor(n).catch(() => {})
    }
    return () => { live = false }
  }, [year, cellsFor])

  useEffect(() => {
    let live = true
    if (regionId) regionFeatures(regionId).then((f) => live && setOutline(f))
    else setOutline([])
    return () => { live = false }
  }, [regionId])

  const res = regionId ? RES_REGION : RES_GLOBAL
  const maxAlt = regionId ? MAX_HEX_ALT.region : MAX_HEX_ALT.global
  const cells = useMemo(
    () => (regionId ? allCells.filter((c) => c.regionId === regionId) : allCells),
    [allCells, regionId],
  )
  // Height scale is fixed across ALL years (once loaded) so playback shows real growth/decline.
  const [allYears, setAllYears] = useState<FireCell[][] | null>(null)
  useEffect(() => {
    const ys = Array.from({ length: YEARS.max - YEARS.min + 1 }, (_, i) => YEARS.min + i)
    Promise.all(ys.map(cellsFor)).then(setAllYears).catch(() => {})
  }, [cellsFor])
  const refs = useMemo(() => {
    if (!allYears) return hexMaxima(cells, res)
    let abs = 1, diff = 1
    for (const yc of allYears) {
      const m = hexMaxima(regionId ? yc.filter((c) => c.regionId === regionId) : yc, res)
      abs = Math.max(abs, m.abs)
      diff = Math.max(diff, m.diff)
    }
    return { abs, diff }
  }, [allYears, cells, res, regionId])

  // ember layer: per-cell scale fixed across all years
  const glowScale = useMemo(() => {
    let abs = 1, diff = 1
    for (const yc of allYears ?? [allCells]) for (const c of yc) {
      abs = Math.max(abs, c.harmonized)
      diff = Math.max(diff, c.harmonized - c.legacy)
    }
    return { abs, diff }
  }, [allYears, allCells])

  useEffect(() => {
    const g = ref.current
    if (!glow || !g || !ready || !allCells.length) return
    glow.setData(allCells, glowScale, g.getCoords)
    glow.setFocus(useApp.getState().regionId)
  }, [glow, ready, allCells, glowScale])
  useEffect(() => { glow?.setMode(mode) }, [glow, mode])
  useEffect(() => { glow?.setFocus(regionId) }, [glow, regionId, ready])

  const hottest = useMemo(
    () => (regionId ? [...cells].sort((a, b) => b.harmonized - a.harmonized).slice(0, 5) : []),
    [cells, regionId],
  )

  // ---- camera -------------------------------------------------------------
  // cameraTarget (tour) wins over the region's default view
  useEffect(() => {
    const g = ref.current
    if (!g) return
    const region = regionById(regionId)
    const target = cameraTarget ?? (place ? { lat: place.lat, lng: place.lng, altitude: 0.6 } : null) ?? region?.center ?? GLOBAL_VIEW
    if (cameraTarget || place) {
      g.controls().autoRotate = false
      swoopTo(g, target, cameraTarget?.ms ?? 2400)
    } else if (region) {
      setDrift(g, true) // slow cinematic orbit around the region
      swoopTo(g, target, 2600)
    } else {
      setDrift(g, false)
      g.controls().autoRotate = true
      swoopTo(g, target, 2200)
    }
  }, [regionId, cameraTarget, place])

  const onReady = useCallback(() => {
    const g = ref.current
    if (!g) return
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

    const controls = g.controls()
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.3
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = g.getGlobeRadius() * 1.25
    controls.maxDistance = g.getGlobeRadius() * 6
    // any manual drag/zoom stops the guided tour
    controls.addEventListener('start', () => {
      const st = useApp.getState()
      if (st.touring) st.stopTour()
      if (st.regionId) controls.autoRotate = false // user took the camera: stop the drift
    })
    // cinematic intro: deep space on the night side, glide over the terminator into daylight
    sunriseIntro(g, sunPosition(), regionById(useApp.getState().regionId)?.center ?? GLOBAL_VIEW)
    window.addEventListener('resize', () => {
      const st = useApp.getState()
      g.pointOfView(fitAltitude(regionById(st.regionId)?.center ?? GLOBAL_VIEW), 400)
    })

    // live sun
    const updateSun = () => {
      const s = sunPosition()
      const p = g.getCoords(s.lat, s.lng)
      sunDir.set(p.x, p.y, p.z).normalize()
    }
    updateSun()
    setInterval(updateSun, 30_000)

    // clouds (rotated in the scene's own render loop, no extra rAF)
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(g.getGlobeRadius() * 1.007, 64, 48),
      makeCloudMaterial(sunDir),
    )
    clouds.rotation.y = -Math.PI / 2
    clouds.onBeforeRender = () => { clouds.rotation.y += 0.00006 }
    g.scene().add(clouds)

    if (glow) g.scene().add(glow.points)
    setReady(true)
  }, [sunDir, glow])

  // ---- hex styling (memoised) ----------------------------------------------
  const isDiff = mode === 'difference'
  const norm = useCallback(
    (h: Hex) => Math.min(1, Math.max(0, h.sumWeight) / (isDiff ? refs.diff : refs.abs)),
    [isDiff, refs],
  )
  const hexWeight = useCallback((d: object) => value(mode, d as FireCell), [mode])
  // region view: linear (honest toggle jump). global view: sqrt so one hot hex doesn't flatten the rest
  const hexAltitude = useCallback(
    (d: object) => 0.003 + (regionId ? norm(d as Hex) : Math.sqrt(norm(d as Hex))) * maxAlt,
    [norm, maxAlt, regionId],
  )
  const hexColor = useCallback(
    (d: object) => {
      const t = Math.sqrt(norm(d as Hex))
      return isDiff
        ? rgb(C.missedLo, C.missed, t)
        : rgb(C.fire, C.hot, Math.min(1, t * (mode === 'harmonized' ? 1.3 : 0.9)))
    },
    [norm, isDiff, mode],
  )
  const hexLabel = useCallback((d: object) => {
    const h = d as Hex
    const leg = h.points.reduce((s, c) => s + c.legacy, 0)
    const har = h.points.reduce((s, c) => s + c.harmonized, 0)
    return `<div style="font:12px 'Archivo Variable',sans-serif;font-variant-numeric:tabular-nums;background:rgba(9,11,15,.9);border:1px solid rgba(236,230,216,.14);padding:6px 8px;border-radius:3px;color:#ece6d8">
      legacy ${leg.toLocaleString()}<br/>harmonized ${har.toLocaleString()}<br/>
      <span style="color:#ff3d81">missed +${(har - leg).toLocaleString()}</span></div>`
  }, [])
  const ringColor = useCallback((d: object) => {
    if ((d as { isPlace?: boolean }).isPlace) return (t: number) => `rgba(143,211,232,${(1 - t) * 0.85})`
    const [r, g, b] = isDiff || mode === 'human' ? C.missed : C.fire
    return (t: number) => `rgba(${r},${g},${b},${(1 - t) * 0.9})`
  }, [isDiff, mode])

  // picked place: a cyan ring the size of its search radius + a label
  const rings = useMemo(
    () => (place ? [{ lat: place.lat, lng: place.lng, isPlace: true, maxR: place.radiusKm / 111 }, ...hottest] : hottest),
    [place, hottest],
  )
  const ringRadius = useCallback((d: object) => (d as { maxR?: number }).maxR ?? 3, [])
  // copies: globe.gl attaches three.js objects to data items, never hand it store objects
  const placeLabels = useMemo(() => (place ? [{ name: place.name, lat: place.lat, lng: place.lng }] : []), [place])
  const placeElement = useCallback((d: object) => {
    const p = d as { name: string }
    const el = document.createElement('div')
    el.style.cssText =
      "transform:translate(-50%,-100%);pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:4px;font-family:'Archivo Variable',sans-serif;"
    el.innerHTML = `<div style="font-stretch:88%;font-weight:600;font-size:13px;color:#ece6d8;background:rgba(9,11,15,.82);border:1px solid rgba(236,230,216,.18);padding:3px 8px;border-radius:3px;white-space:nowrap">${p.name.replace(/</g, '&lt;')}</div><div style="width:1px;height:14px;background:#8fd3e8"></div><div style="width:7px;height:7px;border-radius:50%;background:#8fd3e8;box-shadow:0 0 10px #8fd3e8"></div>`
    return el
  }, [])

  // click the globe to pick a specific spot (sub-area of a region, or anywhere)
  const onGlobeClick = useCallback(({ lat, lng }: { lat: number; lng: number }) => {
    const st = useApp.getState()
    if (st.touring) return
    placeFromPoint(lat, lng).then((p) => useApp.getState().setPlace(p))
  }, [])

  const capColor = useCallback(() => 'rgba(90,209,255,0.04)', [])
  const sideColor = useCallback(() => 'rgba(90,209,255,0.12)', [])
  const strokeColor = useCallback(() => C.cyan, [])

  return (
    <Globe
      ref={ref}
      width={size.w}
      height={size.h}
      animateIn={false}
      rendererConfig={{ antialias: true, powerPreference: 'high-performance' }}
      backgroundColor="#04060b"
      backgroundImageUrl={`${import.meta.env.BASE_URL}textures/night-sky.png`}
      globeMaterial={earthMaterial}
      showAtmosphere
      atmosphereColor="#5ab8ff"
      atmosphereAltitude={0.16}
      onGlobeReady={onReady}
      onGlobeClick={onGlobeClick}
      onPolygonClick={(_p: object, _e: MouseEvent, coords: { lat: number; lng: number }) => onGlobeClick(coords)}
      htmlElementsData={placeLabels}
      htmlElement={placeElement}
      htmlAltitude={0.01}
      // fire hexes
      hexBinPointsData={FIRE_STYLE === 'hex' ? cells : []}
      hexBinPointWeight={hexWeight}
      hexBinResolution={res}
      hexAltitude={hexAltitude}
      hexTopColor={hexColor}
      hexSideColor={hexColor}
      hexMargin={0.15}
      hexTransitionDuration={playing ? 650 : 900}
      hexLabel={hexLabel}
      // selected region outline
      polygonsData={outline}
      polygonAltitude={0.004}
      polygonCapColor={capColor}
      polygonSideColor={sideColor}
      polygonStrokeColor={strokeColor}
      polygonsTransitionDuration={0}
      // pulsing rings on hottest cells (region view only)
      ringsData={rings}
      ringColor={ringColor}
      ringMaxRadius={ringRadius}
      ringPropagationSpeed={1.6}
      ringRepeatPeriod={1100}
      ringAltitude={0.006}
    />
  )
}
