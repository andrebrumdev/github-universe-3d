/**
 * Geometrias da nave (estilo máquina do tempo), construídas uma vez por módulo a partir das medidas de
 * src/lib/ship/geometry.ts. Compartilhadas por todas as instâncias da nave e nunca descartadas.
 */
import * as THREE from 'three'
import {
  arcPath,
  bevelConvexGeometry,
  circleProfile,
  curvePath,
  joinPaths,
  linePath,
  loft,
  sweep,
  transformPath,
  transportFrames,
} from 'three-low-poly'
import {
  ANTENNA,
  BOWL_PROFILE,
  BUBBLE,
  ENGINE_RING,
  ENGINE_RINGS_Z,
  FUSELAGE,
  fuselageSection,
  HEADLIGHTS,
  LATHE_PHI_START,
  NOZZLE,
  PILLAR,
  RADIAL_SEGMENTS,
  RIM,
  RIM_PROFILE,
  SQUARES,
  THRUSTER,
  WING,
  type Vec2,
} from '@/lib/ship/geometry'

const toVector2 = (points: Vec2[]) => points.map(([a, b]) => new THREE.Vector2(a, b))

// ─── Cabine ───

export const BOWL_GEOMETRY = new THREE.LatheGeometry(toVector2(BOWL_PROFILE), RADIAL_SEGMENTS, LATHE_PHI_START)
export const RIM_GEOMETRY = new THREE.LatheGeometry(toVector2(RIM_PROFILE), RADIAL_SEGMENTS, LATHE_PHI_START)

/** A bolha desce até um pouco abaixo do topo do aro, para nascer de dentro dele. */
const BUBBLE_CUT_Y = RIM.top - 0.03 - BUBBLE.center[1]
export const BUBBLE_GEOMETRY = new THREE.SphereGeometry(
  BUBBLE.radius,
  14,
  10,
  0,
  Math.PI * 2,
  0,
  Math.acos(BUBBLE_CUT_Y / BUBBLE.radius),
)

/** Moldura: meio arco de frente para trás sobre a bolha (arcPath no plano XY, girado para o plano YZ). */
function bubbleFrame(): THREE.BufferGeometry {
  const radius = BUBBLE.radius + BUBBLE.frameRadius / 2
  const start = Math.asin((RIM.top - BUBBLE.center[1]) / radius)
  const arc = arcPath({ radius, startAngle: start, endAngle: Math.PI - start, segments: 14 })
  const toShip = new THREE.Matrix4()
    .makeTranslation(BUBBLE.center[0], BUBBLE.center[1], BUBBLE.center[2])
    .multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2))
  return sweep(circleProfile(BUBBLE.frameRadius, 6), transportFrames(transformPath(arc, toShip)), { cap: true })
}
export const BUBBLE_FRAME_GEOMETRY = bubbleFrame()

/**
 * Antena: o arco de ANTENNA.points com um trecho em mola — voltas em volta do arco, com raio que
 * cresce e some (seno), para o fio sair liso da bolha e chegar liso na bolinha.
 */
class CoiledAntenna extends THREE.Curve<THREE.Vector3> {
  private readonly arch = new THREE.CatmullRomCurve3(ANTENNA.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)))

  // o construtor de Curve é protegido nos tipos do three
  constructor() {
    super()
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const { turns, radius, from, to } = ANTENNA.coil
    const point = this.arch.getPointAt(t, target)
    const u = (t - from) / (to - from)
    if (u <= 0 || u >= 1) return point
    const tangent = this.arch.getTangentAt(t)
    const side = new THREE.Vector3(1, 0, 0)
    const normal = new THREE.Vector3().crossVectors(tangent, side).normalize()
    const angle = u * turns * Math.PI * 2
    const r = radius * Math.sin(Math.PI * u)
    return point.addScaledVector(side, r * Math.sin(angle)).addScaledVector(normal, r * (1 - Math.cos(angle)) * 0.5)
  }
}
export const ANTENNA_GEOMETRY = sweep(circleProfile(ANTENNA.radius, 6), transportFrames(curvePath(new CoiledAntenna(), 36)), {
  cap: true,
})
export const ANTENNA_TIP_POSITION = ANTENNA.points[ANTENNA.points.length - 1]
export const ANTENNA_TIP_GEOMETRY = new THREE.IcosahedronGeometry(ANTENNA.tipRadius, 1)

/** Coluna em arco dentro da bolha, atrás do piloto. */
const pillarCurve = new THREE.CatmullRomCurve3(PILLAR.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
export const PILLAR_GEOMETRY = sweep(circleProfile(PILLAR.radius, 6), transportFrames(curvePath(pillarCurve, 10)), {
  cap: true,
})

export const SQUARE_GEOMETRY = new THREE.BoxGeometry(SQUARES.size, SQUARES.size, SQUARES.depth)

/** Farol: disco virado para +z, com aro. */
export const HEADLIGHT_GEOMETRY = new THREE.CylinderGeometry(HEADLIGHTS.radius, HEADLIGHTS.radius, 0.05, 10).rotateX(
  Math.PI / 2,
)
export const HEADLIGHT_BEZEL_GEOMETRY = new THREE.TorusGeometry(HEADLIGHTS.radius, 0.025, 4, 10)

// ─── Fuselagem traseira ───

/**
 * Meia seção elíptica (de `from` a `from + π`) em cada anel; o loft fecha a corda,
 * então as duas metades juntas formam o corpo inteiro — de cima creme, de baixo cinza.
 */
function fuselageHalf(from: number): THREE.BufferGeometry {
  const steps = 6
  const rings = FUSELAGE.map(({ z, cy, rx, ry }) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = from + (i / steps) * Math.PI
      return new THREE.Vector3(rx * Math.cos(a), cy + ry * Math.sin(a), z)
    }),
  )
  return loft(rings, { cap: true })
}
export const FUSELAGE_TOP_GEOMETRY = fuselageHalf(0)
export const FUSELAGE_BOTTOM_GEOMETRY = fuselageHalf(Math.PI)

/**
 * Faixa do motor: loft fechado de 4 elipses (dentro-frente, fora-frente, fora-trás, dentro-trás),
 * ou seja, um anel elíptico de seção retangular abraçando a fuselagem.
 */
function engineBand(z: number): THREE.BufferGeometry {
  const { cy, rx, ry } = fuselageSection(z)
  const ellipse = (grow: number, dz: number) =>
    Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2
      return new THREE.Vector3((rx + grow) * Math.cos(a), cy + (ry + grow) * Math.sin(a), z + dz)
    })
  const { width, thickness, gap } = ENGINE_RING
  const half = width / 2
  return loft(
    [ellipse(gap, half), ellipse(gap + thickness, half), ellipse(gap + thickness, -half), ellipse(gap, -half)],
    { closed: true },
  )
}
export const ENGINE_BAND_GEOMETRIES = ENGINE_RINGS_Z.map(engineBand)

/** Cilindro do three: topo em +y; girado −90° em X, o topo vai para −z (a boca do bocal). */
const nozzleY = FUSELAGE[FUSELAGE.length - 1].cy
export const NOZZLE_BACK_Z = NOZZLE.z - NOZZLE.length
export const NOZZLE_GEOMETRY = new THREE.CylinderGeometry(NOZZLE.radiusBack, NOZZLE.radiusFront, NOZZLE.length, 10)
  .rotateX(-Math.PI / 2)
  .translate(0, nozzleY, NOZZLE.z - NOZZLE.length / 2)
export const NOZZLE_LIP_GEOMETRY = new THREE.TorusGeometry(NOZZLE.radiusBack, NOZZLE.lip, 4, 10).translate(
  0,
  nozzleY,
  NOZZLE_BACK_Z,
)
export const THRUSTER_ORIGIN: [number, number, number] = [0, nozzleY, NOZZLE_BACK_Z]
/** Chama com a base na origem, apontando para −z (o mesh escala z por thrusterLevel). */
export const FLAME_GEOMETRY = new THREE.ConeGeometry(THRUSTER.radius, THRUSTER.length, 8)
  .translate(0, THRUSTER.length / 2, 0)
  .rotateX(-Math.PI / 2)

// ─── Asas (extrusão → bevelConvexGeometry), no frame local da asa ───
// Frame local: x = side · s (para fora), y = espessura, z = z da nave. O mesh aplica raiz + diedro.

export type WingSide = 1 | -1

function wing(side: WingSide): THREE.BufferGeometry {
  const shape = new THREE.Shape(WING.outline.map(([s, z]) => new THREE.Vector2(side * s, z)))
  const extruded = new THREE.ExtrudeGeometry(shape, { depth: WING.thickness, bevelEnabled: false })
    .rotateX(Math.PI / 2) // y do contorno → z da nave; extrusão → −y
    .translate(0, WING.thickness / 2, 0)
  const { geometry } = bevelConvexGeometry(extruded, { radius: 0.02, segments: 1 })
  extruded.dispose()
  return geometry
}

/** Faixas verde-água por cima da lâmina: tubos facetados pelas linhas de WING.stripes. */
function wingStripes(side: WingSide): THREE.BufferGeometry[] {
  return WING.stripes.map(({ radius, line }) => {
    const points = line.map(([s, z]) => new THREE.Vector3(side * s, WING.thickness / 2, z))
    const segments = points.slice(1).map((to, i) => linePath(points[i], to, 2))
    return sweep(circleProfile(radius, 6), transportFrames(joinPaths(...segments)), { cap: true })
  })
}

export const WINGS = ([1, -1] as const).map((side) => ({
  side,
  geometry: wing(side),
  stripes: wingStripes(side),
}))
/** Luzinha em domo (meia esfera) sobre a asa. */
export const WING_LIGHT_GEOMETRY = new THREE.SphereGeometry(WING.lightRadius, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2)
