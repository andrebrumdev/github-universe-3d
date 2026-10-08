/**
 * Geometrias da nave (estilo máquina do tempo), construídas uma vez por módulo a partir das medidas de
 * src/lib/ship/geometry.ts. Compartilhadas por todas as instâncias da nave e nunca descartadas.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { arcPath, circleProfile, curvePath, EdgedBoxGeometry, loft, sweep, transportFrames } from 'three-low-poly'
import {
  ANTENNA,
  CANOPY,
  DASHBOARD,
  DECK_Y,
  ENGINE_RING,
  ENGINE_RINGS_Z,
  FUSELAGE,
  fuselageSection,
  HEADLIGHTS,
  NOZZLE,
  PILLAR,
  PLAN,
  PLAN_SEGMENTS,
  planAngle,
  planFacet,
  planNormal,
  planPoint,
  RIM,
  RIM_SECTION,
  SEAT,
  SQUARES,
  THRUSTER,
  TUB,
  tubRingAt,
  WING,
  wingPoint,
  wingStationAt,
  YOKE,
  YOKE_BOTTOM,
  type Vec3,
} from '@/lib/ship/geometry'

const v3 = ([x, y, z]: Vec3) => new THREE.Vector3(x, y, z)
const PLAN_ANGLES = Array.from({ length: PLAN_SEGMENTS }, (_, k) => planAngle(k))

// ─── Casco, aro e cúpula ───

/**
 * Casco em banheira: loft (sem tampa) dos anéis horizontais de TUB — parede de fora, borda de dentro
 * descendo até o piso. O fundo e o piso são elipses planas à parte: a tampa do loft no anel do piso sairia
 * com o winding invertido, porque esse último trecho desce.
 */
export const TUB_GEOMETRY = loft(
  TUB.rings.map(({ f, y, dz }) =>
    PLAN_ANGLES.map((phi) => {
      const [x, z] = planPoint(phi, f * PLAN.a, f * PLAN.b)
      return new THREE.Vector3(x, y, z + dz)
    }).reverse(), // sentido que deixa as paredes viradas para fora
  ),
  { cap: false }, // o padrão do loft é tampar
)

/** Elipse plana de um anel do casco, virada para cima (piso) ou para baixo (fundo). */
function tubCap({ f, y, dz }: (typeof TUB.rings)[number], up: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape(
    PLAN_ANGLES.map((phi) => {
      const [x, z] = planPoint(phi, f * PLAN.a, f * PLAN.b)
      return new THREE.Vector2(x, up ? -z : z)
    }),
  )
  return new THREE.ShapeGeometry(shape)
    .rotateX(up ? -Math.PI / 2 : Math.PI / 2)
    .translate(0, y, dz)
}
export const TUB_DECK_GEOMETRY = tubCap(TUB.rings[TUB.rings.length - 1], true)
export const TUB_BOTTOM_GEOMETRY = tubCap(TUB.rings[0], false)

/**
 * Aro fino: uma seção (RIM_SECTION) por ponto da planta, deslocada pela normal da elipse, e um loft
 * fechado dando a volta — largura constante em toda a borda, mesmo com a planta alongada.
 */
export const RIM_GEOMETRY = loft(
  PLAN_ANGLES.map((phi) => {
    const [x, z] = planPoint(phi, PLAN.a, PLAN.b)
    const [nx, nz] = planNormal(phi, PLAN.a, PLAN.b)
    return RIM_SECTION.map(([dr, y]) => new THREE.Vector3(x + nx * dr, y, z + nz * dr))
  }),
  { closed: true },
)

/** Quadradinhos: um por faceta da face de fora do aro, centrados na frente. */
export const SQUARE_GEOMETRY = new THREE.BoxGeometry(SQUARES.size, SQUARES.size, SQUARES.depth)
export const SQUARE_PLACEMENTS = SQUARES.facets.map((m) => {
  const { center, yaw } = planFacet(m, PLAN.a, PLAN.b)
  const out = SQUARES.depth / 2 - 0.004
  return {
    position: [center[0] + Math.sin(yaw) * out, (RIM.bottom + RIM.top) / 2, center[1] + Math.cos(yaw) * out] as Vec3,
    yaw,
  }
})

/** Faróis: disco virado para +z com aro, na faceta da parede do casco na altura HEADLIGHTS.y. */
export const HEADLIGHT_GEOMETRY = new THREE.CylinderGeometry(HEADLIGHTS.radius, HEADLIGHTS.radius, 0.04, 10).rotateX(
  Math.PI / 2,
)
export const HEADLIGHT_BEZEL_GEOMETRY = new THREE.TorusGeometry(HEADLIGHTS.radius, 0.022, 4, 10)
const headlightWall = tubRingAt(HEADLIGHTS.y) ?? { f: 1, dz: 0 }
export const HEADLIGHT_PLACEMENTS = HEADLIGHTS.facets.map((m) => {
  const { center, yaw } = planFacet(m, headlightWall.f * PLAN.a, headlightWall.f * PLAN.b)
  return { position: [center[0], HEADLIGHTS.y, center[1] + headlightWall.dz] as Vec3, yaw }
})

/** Cúpula: meio elipsoide (a, altura, b) inclinado para a frente (z += lean·y), apoiado em CANOPY.base. */
export const CANOPY_GEOMETRY = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2)
  .scale(CANOPY.a, CANOPY.height, CANOPY.b)
  .applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, CANOPY.lean, 1, 0, 0, 0, 0, 1))
  .translate(0, CANOPY.base, 0)

/** Coluna grossa em arco, do piso de trás até o alto da cúpula. */
const pillarCurve = new THREE.CatmullRomCurve3(PILLAR.points.map(v3))
export const PILLAR_GEOMETRY = sweep(circleProfile(PILLAR.radius, 8), transportFrames(curvePath(pillarCurve, 10)), {
  cap: true,
})

/**
 * Antena: o arco de ANTENNA.points com um trecho em mola — voltas em volta do arco, com raio que
 * cresce e some (seno), para o fio sair liso da coluna e chegar liso na bolinha.
 */
class CoiledAntenna extends THREE.Curve<THREE.Vector3> {
  private readonly arch = new THREE.CatmullRomCurve3(ANTENNA.points.map(v3))

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
export const ANTENNA_GEOMETRY = sweep(circleProfile(ANTENNA.radius, 6), transportFrames(curvePath(new CoiledAntenna(), 30)), {
  cap: true,
})
export const ANTENNA_TIP_POSITION = ANTENNA.points[ANTENNA.points.length - 1]
export const ANTENNA_TIP_GEOMETRY = new THREE.IcosahedronGeometry(ANTENNA.tipRadius, 1)

// ─── Interior: assento e painel ───

/** Caixa chanfrada centrada na origem (a EdgedBoxGeometry nasce apoiada em y = 0). */
const box = (width: number, height: number, depth: number) =>
  new EdgedBoxGeometry({ width, height, depth, edge: 'chamfer', radius: Math.min(width, height, depth) * 0.25, segments: 1 }).translate(
    0,
    -height / 2,
    0,
  )

const seatShellWidth = SEAT.width + 2 * SEAT.shell
const seatBaseY = DECK_Y + SEAT.shell
/** Peças do assento: concha lilás (base + costas) e almofadas creme. Posição e inclinação de cada uma. */
export const SEAT_PARTS = {
  shell: [
    {
      geometry: box(seatShellWidth, 2 * SEAT.shell, SEAT.cushion.depth + 2 * SEAT.shell),
      position: [0, DECK_Y + SEAT.shell, SEAT.z] as Vec3,
      tilt: 0,
    },
    {
      geometry: box(seatShellWidth, SEAT.back.height + SEAT.shell, SEAT.shell),
      position: [0, seatBaseY + SEAT.back.height / 2, SEAT.back.z - SEAT.back.thickness / 2 - SEAT.shell / 2] as Vec3,
      tilt: -SEAT.back.tilt,
    },
  ],
  cushion: [
    {
      geometry: box(SEAT.width, SEAT.cushion.height, SEAT.cushion.depth),
      position: [0, seatBaseY + SEAT.shell + SEAT.cushion.height / 2, SEAT.z] as Vec3,
      tilt: 0,
    },
    {
      geometry: box(SEAT.width, SEAT.back.height, SEAT.back.thickness),
      position: [0, seatBaseY + SEAT.back.height / 2 + SEAT.shell, SEAT.back.z] as Vec3,
      tilt: -SEAT.back.tilt,
    },
  ],
}

/** Painel: caixa escura inclinada para o piloto, volante redondo com cubo e duas luzinhas em cima. */
export const DASHBOARD_TILT = -0.3
export const DASHBOARD_GEOMETRY = box(DASHBOARD.width, DASHBOARD.height, DASHBOARD.depth)
export const DASHBOARD_POSITION: Vec3 = [0, DECK_Y + DASHBOARD.height / 2, DASHBOARD.z]
/**
 * Volante redondo de painel, no plano da face da frente (grupo com a mesma pose do painel, origem no centro
 * do volante, a uns `gap` da face): aro, cubo curto até a face e três raios.
 */
export const WHEEL_GEOMETRY = new THREE.TorusGeometry(DASHBOARD.wheel.radius, DASHBOARD.wheel.tube, 4, 10)
export const WHEEL_MOUNT: Vec3 = [DASHBOARD.wheel.x, DASHBOARD.wheel.y, -DASHBOARD.depth / 2 - DASHBOARD.wheel.gap]
export const WHEEL_HUB_GEOMETRY = new THREE.CylinderGeometry(0.03, 0.03, DASHBOARD.wheel.gap + 0.01, 6)
  .rotateX(Math.PI / 2)
  .translate(0, 0, (DASHBOARD.wheel.gap + 0.01) / 2)
const SPOKE_LENGTH = DASHBOARD.wheel.radius
export const WHEEL_SPOKES_GEOMETRY = mergeGeometries(
  [0, 1, 2].map((k) =>
    new THREE.BoxGeometry(0.022, SPOKE_LENGTH, 0.022)
      .translate(0, SPOKE_LENGTH / 2, 0)
      .rotateZ((k * Math.PI * 2) / 3),
  ),
)
export const DASHBOARD_LIGHT_GEOMETRY = new THREE.IcosahedronGeometry(0.028, 0)
export const DASHBOARD_LIGHT_Y = DECK_Y + DASHBOARD.height + 0.01

/**
 * Manche em C: o arco (cinza escuro) e as duas empunhaduras (laranja) são varreduras hexagonais de arcos do
 * plano xy, inclinados para o piloto e levados para o centro do manche; a coluna liga o painel ao meio do C.
 */
function yokeArc(from: number, to: number, radius: number, segments: number): THREE.BufferGeometry {
  const path = arcPath({ radius: YOKE.radius, startAngle: from, endAngle: to, segments })
  return sweep(circleProfile(radius, 6), transportFrames(path), { cap: true })
    .rotateX(-YOKE.tilt)
    .translate(...YOKE.center)
}
const GRIP_LENGTH = YOKE.grip
export const YOKE_FRAME_GEOMETRY = yokeArc(YOKE.from + GRIP_LENGTH, YOKE.to - GRIP_LENGTH, YOKE.tube, 8)
export const YOKE_GRIP_GEOMETRIES = [
  yokeArc(YOKE.from, YOKE.from + GRIP_LENGTH, YOKE.gripTube, 3),
  yokeArc(YOKE.to - GRIP_LENGTH, YOKE.to, YOKE.gripTube, 3),
]
/** Coluna: da face da frente do painel (no plano do painel, em x = 0) até o meio de baixo do C. */
const columnStart = new THREE.Vector3(0, DASHBOARD_POSITION[1], DASHBOARD_POSITION[2])
  .add(new THREE.Vector3(0, -0.06, -DASHBOARD.depth / 2 + 0.02).applyAxisAngle(new THREE.Vector3(1, 0, 0), DASHBOARD_TILT))
export const YOKE_COLUMN_GEOMETRY = sweep(
  circleProfile(YOKE.columnRadius, 6),
  transportFrames(curvePath(new THREE.LineCurve3(columnStart, v3(YOKE_BOTTOM)), 2)),
  { cap: true },
)

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

/** Cilindro do three: topo em +y; girado −90° em X, o topo vai para −z (a boca do bocal); achatado em y (oval). */
const nozzleY = FUSELAGE[FUSELAGE.length - 1].cy
export const NOZZLE_BACK_Z = NOZZLE.z - NOZZLE.length
export const NOZZLE_GEOMETRY = new THREE.CylinderGeometry(NOZZLE.radiusBack, NOZZLE.radiusFront, NOZZLE.length, 12)
  .rotateX(-Math.PI / 2)
  .scale(1, NOZZLE.squash, 1)
  .translate(0, nozzleY, NOZZLE.z - NOZZLE.length / 2)
export const NOZZLE_LIP_GEOMETRY = new THREE.TorusGeometry(NOZZLE.radiusBack, NOZZLE.lip, 4, 12)
  .scale(1, NOZZLE.squash, 1)
  .translate(0, nozzleY, NOZZLE_BACK_Z)
export const THRUSTER_ORIGIN: [number, number, number] = [0, nozzleY, NOZZLE_BACK_Z]
/** Chama com a base na origem, apontando para −z (o mesh escala z por thrusterLevel). */
export const FLAME_GEOMETRY = new THREE.ConeGeometry(THRUSTER.radius, THRUSTER.length, 8)
  .translate(0, THRUSTER.length / 2, 0)
  .rotateX(-Math.PI / 2)
  .scale(1, NOZZLE.squash, 1)

// ─── Asas: loft das seções em lente (WING.stations), da raiz no casco até a ponta aberta para o lado ───

export type WingSide = 1 | -1

/**
 * Loft de um arco da lente (ângulos de `from` a `to`) em todas as estações; o loft fecha a corda,
 * então cada pedaço é um sólido fechado. Na asa de −x a ordem dos pontos inverte para manter o winding.
 */
function wingPiece(side: WingSide, from: number, to: number, steps: number): THREE.BufferGeometry {
  const rings = WING.stations.map((station) => {
    const ring = Array.from({ length: steps + 1 }, (_, i) => {
      const [x, y, z] = wingPoint(side, station, from + ((to - from) * i) / steps)
      return new THREE.Vector3(x, y, z)
    })
    return side === 1 ? ring : ring.reverse()
  })
  return loft(rings, { cap: true })
}

/** Lâmina lilás: a lente toda menos a faixa de baixo. */
const bladeArc = (side: WingSide) => wingPiece(side, WING.stripe.to - Math.PI * 2, WING.stripe.from, 8)
/** Faixa verde-água: por baixo, perto do bordo de ataque. */
const stripeArc = (side: WingSide) => wingPiece(side, WING.stripe.from, WING.stripe.to, 3)

/**
 * Luzinha em domo apoiada na face de cima, virada para a normal da lente naquele ponto (tangente da lente
 * por diferença finita, girada para fora; na asa de −x o sentido da lente inverte junto com o x).
 */
function wingLights(side: WingSide) {
  return WING.lights.map(({ z, angle }) => {
    const station = wingStationAt(z)
    const [a, b] = [wingPoint(side, station, angle - 0.01), wingPoint(side, station, angle + 0.01)]
    const normal = new THREE.Vector3(side * (b[1] - a[1]), -side * (b[0] - a[0]), 0).normalize()
    return {
      position: wingPoint(side, station, angle),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal),
    }
  })
}

export const WINGS = ([1, -1] as const).map((side) => ({
  side,
  blade: bladeArc(side),
  stripe: stripeArc(side),
  lights: wingLights(side),
}))
/** Luzinha em domo (meia esfera). */
export const WING_LIGHT_GEOMETRY = new THREE.SphereGeometry(WING.lightRadius, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2)
