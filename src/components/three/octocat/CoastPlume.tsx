import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '@/lib/ship/geometry'
import { bloomLook, useBloom } from '@/store/bloom'
import { flightClock } from '@/store/frameClock'
import { shipPose } from '@/store/shipPose'

/** Comprimento da pluma da chama-piloto (unidades do mundo) e meia largura na boca do bocal. */
export const PLUME_LENGTH = 0.8
export const PLUME_HALF_WIDTH = 0.05
/** Brilho no visual sem bloom e ritmo (1/s) com que acende e apaga com a planagem. */
const PLUME_BRIGHTNESS = 0.55
const PLUME_RATE = 6
/** Quadros em que desenha (transparente) na montagem, para o programa compilar antes do primeiro voo. */
const WARMUP_FRAMES = 3

const VERTEX = /* glsl */ `
attribute vec2 aPlume;
uniform vec3 uStart;
uniform vec3 uEnd;
uniform float uHalfWidth;
varying float vAlong;
varying float vSide;

void main() {
  vAlong = aPlume.x;
  vSide = aPlume.y;
  vec3 p = mix(uStart, uEnd, aPlume.x);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  // virada para a câmera: de lado em relação ao eixo da pluma e à linha de visada, afinando para a ponta
  vec3 axis = (viewMatrix * vec4(uEnd - uStart, 0.0)).xyz;
  vec3 c = cross(axis, -mv.xyz);
  float l = length(c);
  vec3 side = l > 1e-6 ? c / l : vec3(1.0, 0.0, 0.0);
  mv.xyz += side * aPlume.y * uHalfWidth * (1.0 - 0.75 * aPlume.x);
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform vec3 uCore;
uniform vec3 uEdge;
varying float vAlong;
varying float vSide;

void main() {
  float across = 1.0 - smoothstep(0.2, 1.0, abs(vSide));
  float fade = (1.0 - smoothstep(0.1, 1.0, vAlong)) * smoothstep(0.0, 0.06, vAlong + 0.02);
  vec3 color = mix(uCore, uEdge, smoothstep(0.0, 0.8, vAlong));
  gl_FragColor = vec4(color * (across * fade * uOpacity), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** Uniforms do quadro: da boca do bocal `start` para trás (`back`, unitário) por PLUME_LENGTH, com a opacidade. */
function setPlume(material: THREE.ShaderMaterial, start: THREE.Vector3, back: THREE.Vector3, opacity: number): void {
  const u = material.uniforms
  ;(u.uStart.value as THREE.Vector3).copy(start)
  ;(u.uEnd.value as THREE.Vector3).copy(start).addScaledVector(back, PLUME_LENGTH)
  u.uOpacity.value = opacity
}

/** Estado entre quadros (mutável no lugar). */
class PlumeState {
  level = 0
  frames = 0
  readonly start = new THREE.Vector3()
  readonly back = new THREE.Vector3()

  /** Acende com a planagem, apaga fora dela; devolve se ainda desenha. */
  step(on: boolean, dt: number): boolean {
    this.level += ((on ? 1 : 0) - this.level) * (1 - Math.exp(-PLUME_RATE * dt))
    if (!on && this.level < 1e-3) this.level = 0
    return this.level > 0
  }

  warming(): boolean {
    return this.frames++ < WARMUP_FRAMES
  }
}

/**
 * Pluma da chama-piloto na planagem: a chama aponta para a câmera de perseguição e, de trás, o cone dela vira um disco
 * no bocal. Esta faixa curta, virada para a câmera, sai do bocal para trás da nave e some na ponta — a chama-piloto
 * se lê como um cone fraquinho. Só na planagem (acende e apaga com ela); em coordenadas do mundo, como irmão do grupo
 * da nave, com o bocal em `nozzle` (espaço do modelo).
 */
export function CoastPlume({ ship, nozzle }: { ship: RefObject<THREE.Object3D | null>; nozzle: readonly [number, number, number] }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3))
    g.setAttribute('aPlume', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), 2))
    g.setIndex([0, 1, 2, 2, 1, 3])
    return g
  }, [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uStart: { value: new THREE.Vector3() },
          uEnd: { value: new THREE.Vector3() },
          uHalfWidth: { value: PLUME_HALF_WIDTH },
          uOpacity: { value: 0 },
          uCore: { value: new THREE.Color('#E6FDFF') },
          uEdge: { value: new THREE.Color(COLORS.thruster) },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  const state = useMemo(() => new PlumeState(), [])
  const mesh = useRef<THREE.Mesh>(null)

  useFrame(({ clock }, rawDt) => {
    const g = ship.current
    const m = mesh.current
    if (!g || !m) return
    const on = (shipPose.mode === 'traveling' || shipPose.mode === 'returning') && shipPose.coasting
    const live = state.step(on, flightClock.step(clock.elapsedTime, rawDt))
    m.visible = live || state.warming()
    if (!live) return
    const [x, y, z] = nozzle
    state.start.set(x, y, z).multiply(g.scale).applyQuaternion(g.quaternion).add(g.position)
    // para trás da nave (−z do modelo)
    state.back.set(0, 0, -1).applyQuaternion(g.quaternion)
    setPlume(material, state.start, state.back, PLUME_BRIGHTNESS * state.level * bloomLook(useBloom.getState().active).plume)
  })

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} raycast={() => null} />
}
