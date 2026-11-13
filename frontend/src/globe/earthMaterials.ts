/**
 * OWNER: Agent A. Shaders for the "real-time Earth" look:
 * day/night blend from the live sun direction, warm city lights, twilight band,
 * and a cloud layer lit by the same sun.
 */
import * as THREE from 'three'

const vertex = /* glsl */ `
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const earthFragment = /* glsl */ `
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform vec3 sunDir;
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    float i = dot(normalize(vN), sunDir);
    vec3 day = texture2D(dayTex, vUv).rgb;
    vec3 night = texture2D(nightTex, vUv).rgb;
    // warm, punchy city lights
    vec3 lights = pow(night, vec3(1.15)) * vec3(2.6, 1.9, 1.15);
    float dayAmt = smoothstep(-0.06, 0.14, i);
    vec3 dayLit = day * (0.3 + 0.85 * max(i, 0.0));
    vec3 col = mix(lights + day * 0.015, dayLit, dayAmt);
    // thin twilight glow along the terminator
    float twi = exp(-pow(i / 0.045, 2.0));
    col += vec3(1.0, 0.42, 0.14) * twi * 0.015;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

const cloudFragment = /* glsl */ `
  uniform sampler2D cloudTex;
  uniform vec3 sunDir;
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    float i = dot(normalize(vN), sunDir);
    vec4 c = texture2D(cloudTex, vUv);
    float density = c.a * max(max(c.r, c.g), c.b);
    float light = smoothstep(-0.15, 0.3, i);
    vec3 col = mix(vec3(0.03, 0.04, 0.07), vec3(1.0), light);
    gl_FragColor = vec4(col, density * mix(0.18, 0.75, light));
    #include <colorspace_fragment>
  }
`

const loader = new THREE.TextureLoader()
const tex = (url: string) => {
  const t = loader.load(url)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function makeEarthMaterial(sunDir: THREE.Vector3) {
  return new THREE.ShaderMaterial({
    uniforms: {
      dayTex: { value: tex(`${import.meta.env.BASE_URL}textures/earth-blue-marble.jpg`) },
      nightTex: { value: tex(`${import.meta.env.BASE_URL}textures/earth-night.jpg`) },
      sunDir: { value: sunDir },
    },
    vertexShader: vertex,
    fragmentShader: earthFragment,
  })
}

export function makeCloudMaterial(sunDir: THREE.Vector3) {
  return new THREE.ShaderMaterial({
    uniforms: {
      cloudTex: { value: tex(`${import.meta.env.BASE_URL}textures/clouds.png`) },
      sunDir: { value: sunDir },
    },
    vertexShader: vertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
  })
}
