/**
 * OWNER: Agent A. "Ember" fire layer: every fire cell becomes a small cluster of
 * glowing, flickering, additively blended points. One draw call for everything.
 *
 * - legacy → harmonized: embers swell and brighten (uniform tween, no rebuild)
 * - difference mode: only the missed part, in magenta
 * - year change: per-point values tween from old to new when the layout matches
 * - region focus: other regions fade to embers in the dark
 */
import * as THREE from 'three'
import type { FireCell, Mode } from '../shared/types'

const SPRITES_PER_CELL = 4

const vertex = /* glsl */ `
  attribute float aLeg;
  attribute float aHar;
  attribute float aDiff;
  attribute float aSeed;
  attribute float aRegion;
  uniform float uMix;
  uniform float uDiff;
  uniform float uTime;
  uniform float uFocus;
  uniform float uPixelRatio;
  varying float vI;
  varying float vDim;
  void main() {
    float v = mix(aLeg, aHar, uMix);
    float val = mix(v, aDiff, uDiff);
    float flick = 0.82 + 0.18 * sin(uTime * (2.5 + aSeed * 5.0) + aSeed * 50.0)
                       * sin(uTime * (1.3 + aSeed * 2.0) + aSeed * 17.0);
    float dim = (uFocus < 0.0 || abs(aRegion - uFocus) < 0.5) ? 1.0 : 0.18;
    vI = val * flick;
    vDim = dim;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (1.5 + 30.0 * val) * flick * uPixelRatio * (320.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const fragment = /* glsl */ `
  uniform vec3 cFire;
  uniform vec3 cHot;
  uniform vec3 cMissed;
  uniform float uDiff;
  varying float vI;
  varying float vDim;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;
    float core = exp(-r * 10.0);
    float halo = exp(-r * 2.4) * 0.55;
    // deep red-orange halo, hot core only on strong fires (keeps them distinct from yellow city lights)
    vec3 fire = mix(cFire, cHot, clamp(core * core * (0.2 + vI * 1.2), 0.0, 1.0));
    vec3 col = mix(fire, cMissed, uDiff);
    float a = (core + halo) * clamp(0.12 + vI * 1.5, 0.0, 1.0) * vDim;
    gl_FragColor = vec4(col * a, a);
  }
`

export interface GlowScale { abs: number; diff: number }

export class FireGlow {
  readonly points: THREE.Points
  private mat: THREE.ShaderMaterial
  private geo = new THREE.BufferGeometry()
  private target = { mix: 0, diff: 0 }
  private cur = { leg: new Float32Array(0), har: new Float32Array(0), dif: new Float32Array(0) }
  private goal = { leg: new Float32Array(0), har: new Float32Array(0), dif: new Float32Array(0) }
  private regionIndex = new Map<string, number>()
  private clock = new THREE.Clock()

  constructor(colors: { fire: number[]; hot: number[]; missed: number[] }) {
    const v3 = (c: number[]) => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255)
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMix: { value: 0 },
        uDiff: { value: 0 },
        uTime: { value: 0 },
        uFocus: { value: -1 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
        cFire: { value: v3(colors.fire) },
        cHot: { value: v3(colors.hot) },
        cMissed: { value: v3(colors.missed) },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.points = new THREE.Points(this.geo, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 2
    this.points.onBeforeRender = () => this.tick()
  }

  /** Rebuild or tween to new cells. getCoords = globe.getCoords. */
  setData(
    cells: FireCell[],
    scale: GlowScale,
    getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number },
  ) {
    const n = cells.length * SPRITES_PER_CELL
    const leg = new Float32Array(n), har = new Float32Array(n), dif = new Float32Array(n)
    const sameLayout = this.goal.leg.length === n
    let pos: Float32Array | null = null, seed: Float32Array | null = null, reg: Float32Array | null = null
    if (!sameLayout) {
      pos = new Float32Array(n * 3); seed = new Float32Array(n); reg = new Float32Array(n)
    }
    let k = 0
    cells.forEach((c, ci) => {
      for (let s = 0; s < SPRITES_PER_CELL; s++, k++) {
        // deterministic jitter per (cell, sprite)
        const h = Math.sin(ci * 12.9898 + s * 78.233) * 43758.5453
        const rnd = h - Math.floor(h)
        const share = s === 0 ? 1 : 0.35 + rnd * 0.4
        leg[k] = Math.sqrt(Math.min(1, c.legacy / scale.abs)) * share
        har[k] = Math.sqrt(Math.min(1, c.harmonized / scale.abs)) * share
        dif[k] = Math.sqrt(Math.min(1, Math.max(0, c.harmonized - c.legacy) / scale.diff)) * share
        if (pos && seed && reg) {
          const j = s === 0 ? 0 : 0.9
          const lat = c.lat + (rnd - 0.5) * j
          const lng = c.lng + (((h * 7) % 1) - 0.5) * j * 1.3
          const p = getCoords(lat, lng, 0.003)
          pos.set([p.x, p.y, p.z], k * 3)
          seed[k] = rnd
          if (!this.regionIndex.has(c.regionId)) this.regionIndex.set(c.regionId, this.regionIndex.size)
          reg[k] = this.regionIndex.get(c.regionId)!
        }
      }
    })
    this.goal = { leg, har, dif }
    if (!sameLayout && pos && seed && reg) {
      this.geo.dispose()
      this.geo = new THREE.BufferGeometry()
      this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
      this.geo.setAttribute('aRegion', new THREE.BufferAttribute(reg, 1))
      this.cur = { leg: leg.slice(), har: har.slice(), dif: dif.slice() }
      this.geo.setAttribute('aLeg', new THREE.BufferAttribute(this.cur.leg, 1))
      this.geo.setAttribute('aHar', new THREE.BufferAttribute(this.cur.har, 1))
      this.geo.setAttribute('aDiff', new THREE.BufferAttribute(this.cur.dif, 1))
      this.points.geometry = this.geo
    }
  }

  setMode(mode: Mode) {
    this.target.mix = mode === 'legacy' ? 0 : 1
    this.target.diff = mode === 'difference' ? 1 : 0
  }

  setFocus(regionId: string | null) {
    this.mat.uniforms.uFocus.value = regionId == null ? -1 : (this.regionIndex.get(regionId) ?? -1)
  }

  private tick() {
    const dt = Math.min(0.05, this.clock.getDelta())
    const u = this.mat.uniforms
    u.uTime.value += dt
    const ease = 1 - Math.exp(-dt * 4.5) // ~1s settle
    u.uMix.value += (this.target.mix - u.uMix.value) * ease
    u.uDiff.value += (this.target.diff - u.uDiff.value) * ease
    // year tween
    const { leg, har, dif } = this.cur
    if (leg.length === this.goal.leg.length && leg.length) {
      let moving = false
      for (let i = 0; i < leg.length; i++) {
        const a = this.goal.leg[i] - leg[i], b = this.goal.har[i] - har[i], c = this.goal.dif[i] - dif[i]
        if (Math.abs(a) + Math.abs(b) + Math.abs(c) > 1e-4) {
          leg[i] += a * ease; har[i] += b * ease; dif[i] += c * ease
          moving = true
        }
      }
      if (moving) {
        this.geo.getAttribute('aLeg').needsUpdate = true
        this.geo.getAttribute('aHar').needsUpdate = true
        this.geo.getAttribute('aDiff').needsUpdate = true
      }
    }
  }
}
