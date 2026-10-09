import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { barycenterOffset } from '@/lib/universe/barycenter'
import { SUN_RADIUS, type OrbitSystem, type Vec3 } from '@/lib/universe/orbits'
import { seededRandom } from '@/lib/universe/random'
import { disco } from '@/store/disco'
import { simClock } from '@/store/simClock'

/** Fachos de luz do globo: cores, comprimento (unidades do mundo) e abertura (rad). */
const BEAM_COLORS = ['#ff4fd8', '#22d3ee', '#ffd23f', '#10b981', '#a78bfa', '#ff8a3d'] as const
const BEAM_LENGTH = 42
const BEAM_ANGLE = 0.09
/** Opacidade dos fachos com a festa acesa (aditivos: podem pegar bloom). */
const BEAM_OPACITY = 0.2
/** Brilhos que piscam em volta do globo. */
const SPARKLES = 18

/**
 * Cone unitário ao longo de +y (ápice no centro do sol, y = 0; boca em y = 1, raio `tan(BEAM_ANGLE)`), com alfa por
 * vértice: nasce dentro do sol, acende logo fora dele e some na ponta.
 */
function beamGeometry(): THREE.BufferGeometry {
  const RADIAL = 10
  const STEPS = 8
  const radius = Math.tan(BEAM_ANGLE)
  const start = (SUN_RADIUS * 1.1) / BEAM_LENGTH
  const pos: number[] = []
  const color: number[] = []
  const index: number[] = []
  for (let s = 0; s <= STEPS; s++) {
    const y = s / STEPS
    const alpha = Math.pow(1 - y, 1.3) * Math.min(1, Math.max(0, (y - start) * 8))
    for (let k = 0; k <= RADIAL; k++) {
      const a = (k / RADIAL) * Math.PI * 2
      pos.push(Math.cos(a) * radius * y, y, Math.sin(a) * radius * y)
      color.push(1, 1, 1, alpha)
    }
  }
  for (let s = 0; s < STEPS; s++) {
    for (let k = 0; k < RADIAL; k++) {
      const i = s * (RADIAL + 1) + k
      const j = i + RADIAL + 1
      index.push(i, j, i + 1, i + 1, j, j + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 4))
  g.setIndex(index)
  g.scale(BEAM_LENGTH, BEAM_LENGTH, BEAM_LENGTH)
  return g
}

/** Ponto de luz macio (textura pequena pintada uma vez): o brilho dos flashes. */
function sparkleTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    // cruz fina: o brilho de estrela
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(size / 2 - 1, 4, 2, size - 8)
    ctx.fillRect(4, size / 2 - 1, size - 8, 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Modo disco: fachos coloridos saindo do sol-globo e varrendo a cena (cones aditivos girando e subindo e descendo) e
 * flashes coloridos piscando em volta dele. Monta só durante a festa (e nunca com movimento reduzido); o nível da
 * festa acende e apaga tudo junto.
 */
export function DiscoBeams({ system }: { system: OrbitSystem }) {
  const root = useRef<THREE.Group>(null)
  const pivots = useRef<(THREE.Group | null)[]>([])
  const geometry = useMemo(() => beamGeometry(), [])
  const materials = useMemo(
    () =>
      BEAM_COLORS.map(
        (color) =>
          new THREE.MeshBasicMaterial({
            color,
            vertexColors: true,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
      ),
    [],
  )
  // flashes: posições e cores reescritas no lugar, um ciclo próprio por flash
  const sparkle = useMemo(() => {
    const rng = seededRandom('disco-sparkles')
    const positions = new Float32Array(SPARKLES * 3)
    const colors = new Float32Array(SPARKLES * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const material = new THREE.PointsMaterial({
      size: 1.4,
      map: sparkleTexture(),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    return { geo, material, rng, points: new THREE.Points(geo, material) }
  }, [])
  /** Ciclo de cada flash (fase, ritmo, cor e lugar), reescrito no lugar a cada quadro. */
  const cycles = useRef(
    Array.from({ length: SPARKLES }, (_, i) => ({ phase: i / SPARKLES, speed: 0.8 + ((i * 0.618) % 1) * 1.2, tint: new THREE.Color(), spot: [0, 0, 0] as Vec3 })),
  )
  useEffect(
    () => () => {
      geometry.dispose()
      for (const m of materials) m.dispose()
      sparkle.geo.dispose()
      sparkle.material.map?.dispose()
      sparkle.material.dispose()
    },
    [geometry, materials, sparkle],
  )
  const sunAt = useMemo<Vec3>(() => [0, 0, 0], [])
  const clockRef = useRef(0)

  useFrame((_, dt) => {
    const level = disco.level
    clockRef.current += dt
    const t = clockRef.current
    barycenterOffset(system, simClock.time, sunAt)
    root.current?.position.set(sunAt[0], sunAt[1], sunAt[2])
    for (let i = 0; i < BEAM_COLORS.length; i++) {
      const p = pivots.current[i]
      if (!p) continue
      // cada facho gira em volta do sol e varre para cima e para baixo, em ritmos diferentes
      p.rotation.set(0, t * (0.35 + 0.07 * i) + (i * Math.PI * 2) / BEAM_COLORS.length, 1.15 + 0.5 * Math.sin(t * (0.6 + 0.11 * i) + i))
      // oxlint-disable-next-line react/immutability -- materiais do Three.js são mutáveis por design
      materials[i].opacity = BEAM_OPACITY * level
    }
    // flashes: cada um acende e apaga num ciclo; ao recomeçar, nasce em outro lugar e com outra cor
    const s = sparkle
    const positions = s.geo.getAttribute('position') as THREE.BufferAttribute
    const colors = s.geo.getAttribute('color') as THREE.BufferAttribute
    for (let i = 0; i < SPARKLES; i++) {
      const c = cycles.current[i]
      const before = c.phase
      c.phase = (c.phase + dt * c.speed) % 1
      if (c.phase < before || c.spot[0] === 0) {
        const u = s.rng() * 2 - 1
        const a = s.rng() * Math.PI * 2
        const r = SUN_RADIUS * (1.25 + s.rng() * 2.2)
        const ring = Math.sqrt(1 - u * u)
        c.spot[0] = Math.cos(a) * ring * r || 1e-3
        c.spot[1] = u * r
        c.spot[2] = Math.sin(a) * ring * r
        c.tint.set(BEAM_COLORS[Math.floor(s.rng() * BEAM_COLORS.length)])
      }
      const flash = Math.pow(Math.sin(Math.PI * c.phase), 6) * level
      positions.setXYZ(i, c.spot[0], c.spot[1], c.spot[2])
      colors.setXYZ(i, c.tint.r * flash, c.tint.g * flash, c.tint.b * flash)
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
  })

  return (
    <group ref={root}>
      {BEAM_COLORS.map((color, i) => (
        <group
          key={color}
          ref={(g) => {
            pivots.current[i] = g
          }}
        >
          <mesh geometry={geometry} material={materials[i]} renderOrder={3} raycast={() => null} frustumCulled={false} />
        </group>
      ))}
      <primitive object={sparkle.points} renderOrder={3} raycast={() => null} />
    </group>
  )
}
