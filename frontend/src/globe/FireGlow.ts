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
  attribute float aHuman;
  uniform float uMix;
  uniform float uDiff;
  uniform float uTime;
  uniform float uFocus;
  uniform float uPixelRatio;
  uniform float uFlare;
  uniform vec2 uRange;
  varying float vI;
  varying float vDim;
  varying float vHuman;
  void main() {
    vHuman = aHuman;
    // spectrum filter: fires outside the chosen human-likelihood band fade to a faint trace
    float inBand = step(uRange.x - 0.0001, aHuman) * step(aHuman, uRange.y + 0.0001);
    float bandK = mix(0.06, 1.0, inBand);
    float v = mix(aLeg, aHar, uMix);
    float val = mix(v, aDiff, uDiff);
    float flick = 0.82 + 0.18 * sin(uTime * (2.5 + aSeed * 5.0) + aSeed * 50.0)
                       * sin(uTime * (1.3 + aSeed * 2.0) + aSeed * 17.0);
    float dim = (uFocus < 0.0 || abs(aRegion - uFocus) < 0.5) ? 1.0 : 0.18;
    float flare = 1.0 + uFlare * (0.7 + 0.6 * aSeed);
    vI = val * flick * flare;
    vDim = dim * bandK;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // grow with zoom, but cap so sprites don't get clipped by the globe surface up close
    float zoom = min(320.0 / -mv.z, 1.6);
    gl_PointSize = min((1.5 + 30.0 * val) * flick * (1.0 + uFlare * 0.55) * zoom, 44.0) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`

const fragment = /* glsl */ `
  uniform vec3 cFire;
  uniform vec3 cHot;
  uniform vec3 cMissed;
  uniform float uDiff;
  uniform float uHuman;
  uniform vec3 cNatural;
  varying float vI;
  varying float vDim;
  varying float vHuman;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;
    float core = exp(-r * 10.0);
    float halo = exp(-r * 2.4) * 0.55;
    // deep red-orange halo, hot core only on strong fires (keeps them distinct from yellow city lights)
    vec3 fire = mix(cFire, cHot, clamp(core * core * (0.2 + vI * 1.2), 0.0, 1.0));
    vec3 col = mix(fire, cMissed, uDiff);
    // human vs natural: cool ice = likely natural, hot magenta = likely human-driven
    vec3 hn = mix(cNatural, cMissed, smoothstep(0.25, 0.85, vHuman));
    hn = mix(hn, vec3(1.0), core * core * 0.35);
    col = mix(col, hn, uHuman);
    float a = (core + halo) * clamp(0.12 + vI * 1.5, 0.0, 1.0) * vDim;
    gl_FragColor = vec4(col * a, a);
  }
`

export interface GlowScale { abs: number; diff: number }

export class FireGlow {
  readonly points: THREE.Points
  private mat: THREE.ShaderMaterial
  private geo = new THREE.BufferGeometry()
  private target = { mix: 0, diff: 0, human: 0 }
  private humanAttr = new Float32Array(0)
  private cur = { leg: new Float32Array(0), har: new Float32Array(0), dif: new Float32Array(0) }
  private goal = { leg: new Float32Array(0), har: new Float32Array(0), dif: new Float32Array(0) }
  private regionIndex = new Map<string, number>()
  private clock = new THREE.Clock()

  constructor(colors: { fire: number[]; hot: number[]; missed: number[]; natural: number[] }) {
    const v3 = (c: number[]) => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255)
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMix: { value: 0 },
        uDiff: { value: 0 },
        uFlare: { value: 0 },
        uHuman: { value: 0 },
        uRange: { value: new THREE.Vector2(0, 1) },
        cNatural: { value: v3(colors.natural) },
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
    const hum = new Float32Array(n)
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
        hum[k] = c.human ?? 0.5
        if (pos && seed && reg) {
          const j = s === 0 ? 0 : 0.9
          const lat = c.lat + (rnd - 0.5) * j
          const lng = c.lng + (((h * 7) % 1) - 0.5) * j * 1.3
          const p = getCoords(lat, lng, 0.006)
          pos.set([p.x, p.y, p.z], k * 3)
          seed[k] = rnd
          if (!this.regionIndex.has(c.regionId)) this.regionIndex.set(c.regionId, this.regionIndex.size)
          reg[k] = this.regionIndex.get(c.regionId)!
        }
      }
    })
    this.goal = { leg, har, dif }
    if (sameLayout && this.humanAttr.length === n) {
      this.humanAttr.set(hum)
      this.geo.getAttribute('aHuman').needsUpdate = true
    }
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
      this.humanAttr = hum
      this.geo.setAttribute('aHuman', new THREE.BufferAttribute(this.humanAttr, 1))
      this.points.geometry = this.geo
    }
  }

  setMode(mode: Mode) {
    // TRIAL cinematic: a short flare when the record gains fires (legacy -> harmonized / missed)
    if (mode !== 'legacy' && this.target.mix === 0) this.mat.uniforms.uFlare.value = 1
    this.target.mix = mode === 'legacy' ? 0 : 1
    this.target.diff = mode === 'difference' ? 1 : 0
    this.target.human = mode === 'human' ? 1 : 0
  }

  setRange(lo: number, hi: number) {
    this.mat.uniforms.uRange.value.set(lo, hi)
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
    u.uFlare.value *= Math.exp(-dt * 2.2)
    u.uHuman.value += (this.target.human - u.uHuman.value) * ease
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
