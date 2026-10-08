/**
 * Geometrias da nave (estilo máquina do tempo), construídas uma vez por módulo a partir das medidas de
 * src/lib/ship/geometry.ts. Compartilhadas por todas as instâncias da nave e nunca descartadas.
 */
import * as THREE from 'three'
import { arcPath, bevelConvexGeometry, circleProfile, curvePath, loft, sweep, transformPath, transportFrames } from 'three-low-poly'
import {
  ANTENNA,
  BOWL_PROFILE,
  BUBBLE,
  ENGINE_RING,
  ENGINE_RINGS_Z,
  FUSELAGE,
  fuselageSection,
  HEADLIGHTS,
  KEEL,
  LATHE_PHI_START,
  NOZZLE,
  RADIAL_SEGMENTS,
  RIM,
  RIM_PROFILE,
  SQUARES,
  STABILIZER,
  THRUSTER,
  TOP_FIN,
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

const antennaCurve = new THREE.CatmullRomCurve3(ANTENNA.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
export const ANTENNA_GEOMETRY = sweep(circleProfile(ANTENNA.radius, 6), transportFrames(curvePath(antennaCurve, 10)), {
  cap: true,
})
export const ANTENNA_TIP_POSITION = ANTENNA.points[ANTENNA.points.length - 1]
export const ANTENNA_TIP_GEOMETRY = new THREE.IcosahedronGeometry(ANTENNA.tipRadius, 1)

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

// ─── Aletas (extrusão → bevelConvexGeometry) ───

function bevel(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const { geometry: beveled } = bevelConvexGeometry(geometry, { radius: 0.02, segments: 1 })
  geometry.dispose()
  return beveled
}

/** Lâmina vertical no plano YZ a partir de um contorno (z, y), centrada em x = 0. */
function verticalBlade(outline: Vec2[], thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(toVector2(outline))
  const extruded = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
    .translate(0, 0, -thickness / 2)
    .rotateY(-Math.PI / 2) // x do contorno → z da nave; extrusão → x
  return bevel(extruded)
}

export const TOP_FIN_GEOMETRY = verticalBlade(TOP_FIN.outline, TOP_FIN.thickness)
export const KEEL_GEOMETRY = verticalBlade(KEEL.outline, KEEL.thickness)

/** Lâmina horizontal a partir de um contorno (x, z), com o topo em STABILIZER.top. */
function stabilizer(): THREE.BufferGeometry {
  const shape = new THREE.Shape(toVector2(STABILIZER.outline))
  const extruded = new THREE.ExtrudeGeometry(shape, { depth: STABILIZER.thickness, bevelEnabled: false })
    .rotateX(Math.PI / 2) // y do contorno → z da nave; extrusão → −y
    .translate(0, STABILIZER.top, 0)
  return bevel(extruded)
}
export const STABILIZER_GEOMETRY = stabilizer()
export const STABILIZER_LIGHT_GEOMETRY = new THREE.IcosahedronGeometry(STABILIZER.lightRadius, 1)
