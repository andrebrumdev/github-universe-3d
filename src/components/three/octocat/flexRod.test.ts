import * as THREE from 'three'
import { circleProfile, curvePath, sweep, transportFrames } from 'three-low-poly'
import { describe, expect, it } from 'vitest'
import { ESCORT_LEAN_DEPTH, knockPose, SHIP_SCALE, THREE_QUARTER_YAW } from '@/lib/ship/escort'
import { COCKPIT, FREE_TENTACLE } from '@/lib/ship/geometry'
import { hoverOffset } from '@/lib/ship/motion'
import { applyImpulse, setRest } from '@/lib/ship/verlet'
import { FlexRod, InertiaProbe, inertiaFrameFor, PILOT_INERTIA } from './flexRod'

/** Tentáculo de teste: arco no plano xy, raiz na origem, varrido como os do piloto (hexágono afinando). */
const POINTS: [number, number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 5) * (Math.PI / 2)
  return [Math.sin(a), 1 - Math.cos(a), 0]
})
const SEGMENTS = 12

function tube(points: [number, number, number][] = POINTS) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal')
  const stations = transportFrames(curvePath(curve, SEGMENTS), new THREE.Vector3(0, 0, 1))
  const geometry = sweep(circleProfile(1, 6, 0.6 + Math.PI / 6), stations, { scale: (t) => 0.13 - 0.09 * t, cap: true }).toNonIndexed()
  const ts = Array.from({ length: SEGMENTS + 1 }, (_, i) => curve.getUtoTmapping(i / SEGMENTS, 0))
  return { geometry, ts }
}

const positionsOf = (geometry: THREE.BufferGeometry) => Array.from(geometry.attributes.position.array)

describe('FlexRod (malha dobrada pela cadeia)', () => {
  it('na pose de descanso remonta exatamente a malha desenhada', () => {
    const { geometry, ts } = tube()
    const original = positionsOf(geometry)
    const rod = new FlexRod(POINTS, ts, [geometry])
    // força a remontagem mesmo sem movimento
    rod.chain.pos[3] += 1
    rod.sync()
    rod.pose()
    positionsOf(geometry).forEach((v, i) => expect(v).toBeCloseTo(original[i], 5))
  })

  it('a malha segue a cadeia: girar tudo em torno da raiz gira a malha junto', () => {
    const { geometry, ts } = tube()
    const original = positionsOf(geometry)
    const rod = new FlexRod(POINTS, ts, [geometry])
    const [c, s] = [Math.cos(0.4), Math.sin(0.4)]
    for (let i = 0; i < rod.chain.count; i++) {
      const [x, y] = [rod.chain.rest[i * 3], rod.chain.rest[i * 3 + 1]]
      rod.chain.pos[i * 3] = c * x - s * y
      rod.chain.pos[i * 3 + 1] = s * x + c * y
    }
    rod.sync()
    const moved = positionsOf(geometry)
    for (let v = 0; v < moved.length; v += 3) {
      const [x, y, z] = original.slice(v, v + 3)
      expect(moved[v]).toBeCloseTo(c * x - s * y, 3)
      expect(moved[v + 1]).toBeCloseTo(s * x + c * y, 3)
      expect(moved[v + 2]).toBeCloseTo(z, 3)
    }
    // e a ponta acompanha o último nó
    const tip = rod.tip(new THREE.Vector3())
    expect(tip.distanceTo(new THREE.Vector3().fromArray(rod.chain.pos, (rod.chain.count - 1) * 3))).toBeLessThan(1e-5)
  })

  it('braço livre (raiz inclinada para fora do plano) girado em z no ombro: a seção gira junto, sem torção', () => {
    const { geometry, ts } = tube(FREE_TENTACLE.points)
    const original = positionsOf(geometry)
    const rod = new FlexRod(FREE_TENTACLE.points, ts, [geometry])
    const [ox, oy] = FREE_TENTACLE.points[0]
    const rigidError = (angle: number, withRootTurn: boolean) => {
      const [c, s] = [Math.cos(angle), Math.sin(angle)]
      FREE_TENTACLE.points.forEach(([x, y, z], i) => setRest(rod.chain, i, ox + c * (x - ox) - s * (y - oy), oy + s * (x - ox) + c * (y - oy), z))
      if (withRootTurn) rod.rootTurn.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle)
      else rod.rootTurn.identity()
      rod.pose()
      const moved = positionsOf(geometry)
      let max = 0
      for (let v = 0; v < moved.length; v += 3) {
        const [x, y, z] = original.slice(v, v + 3)
        const expected = [ox + c * (x - ox) - s * (y - oy), oy + s * (x - ox) + c * (y - oy), z]
        max = Math.max(max, Math.hypot(moved[v] - expected[0], moved[v + 1] - expected[1], moved[v + 2] - expected[2]))
      }
      return max
    }
    // sem levar o giro para a raiz, o menor giro da tangente torce a seção (o defeito da revisão: ~0,04 em 0,9 rad)
    expect(rigidError(0.9, false)).toBeGreaterThan(0.02)
    // com o giro na raiz, apontar (0,9 rad) e o pico do aceno (±0,45) são o giro rígido da malha desenhada
    for (const angle of [0.9, 0.45, -0.45]) expect(rigidError(angle, true)).toBeLessThan(1e-4)
  })

  it('a esfera envolvente cobre qualquer pose (raiz presa, comprimento fixo)', () => {
    const { geometry, ts } = tube()
    const rod = new FlexRod(POINTS, ts, [geometry], { stiffness: 0, damping: 1 })
    const sphere = geometry.boundingSphere!.clone()
    applyImpulse(rod.chain, 40, -30, 25)
    for (let k = 0; k < 120; k++) {
      rod.step(1 / 60, { linear: [200 * Math.sin(k), 150, -100], angular: [0, 0, 0] })
      const p = geometry.attributes.position.array
      for (let v = 0; v < p.length; v += 3) {
        expect(sphere.containsPoint(new THREE.Vector3(p[v], p[v + 1], p[v + 2]))).toBe(true)
      }
    }
  })

  it('balança com um tranco e assenta de volta na malha original', () => {
    const { geometry, ts } = tube()
    const original = positionsOf(geometry)
    const rod = new FlexRod(POINTS, ts, [geometry], { stiffness: 120, damping: 4 })
    applyImpulse(rod.chain, 2, 2, 1)
    const still = { linear: [0, 0, 0], angular: [0, 0, 0] } as const
    rod.step(0.1, still)
    const swing = Math.max(...positionsOf(geometry).map((v, i) => Math.abs(v - original[i])))
    expect(swing).toBeGreaterThan(0.05)
    for (let k = 0; k < 300; k++) rod.step(1 / 60, still)
    positionsOf(geometry).forEach((v, i) => expect(v).toBeCloseTo(original[i], 3))
  })
})

describe('InertiaProbe', () => {
  const probe = () => new InertiaProbe({ gain: 1, maxLinear: 1e6, angularGain: 1, maxAngular: 1e6, smoothing: 1e-6 })

  it('acelerar em +x no mundo empurra a cadeia para −x no referencial local (girado)', () => {
    const sonda = probe()
    const object = new THREE.Object3D()
    object.rotation.y = Math.PI / 2 // o +z local aponta para o +x do mundo
    object.scale.setScalar(0.5)
    const dt = 1 / 60
    for (let k = 0; k < 4; k++) {
      const t = k * dt
      object.position.set(5 * t * t, 0, 0) // a = 10 no mundo
      object.updateMatrixWorld()
      sonda.sample(object, dt)
    }
    const [x, y, z] = sonda.input.linear
    // −a, no local, em unidades locais: 10 / 0,5 = 20 ao longo de −z local
    expect(z).toBeCloseTo(-20, 1)
    expect(Math.abs(x) + Math.abs(y)).toBeLessThan(1e-3)
  })

  it('parado (ou em velocidade constante) não sente nada', () => {
    const sonda = probe()
    const object = new THREE.Object3D()
    for (let k = 0; k < 5; k++) {
      object.position.set(k * 0.3, 0, 0)
      object.updateMatrixWorld()
      sonda.sample(object, 1 / 60)
    }
    expect(Math.hypot(...sonda.input.linear)).toBeLessThan(1e-3)
    expect(Math.hypot(...sonda.input.angular)).toBeLessThan(1e-3)
  })

  it('em viagem rápida (dezenas de unidades por quadro) ainda sente a aceleração', () => {
    const sonda = probe()
    const object = new THREE.Object3D()
    const dt = 1 / 60
    for (let k = 0; k < 5; k++) {
      const t = k * dt
      object.position.set(3000 * t + 15 * t * t, 0, 0) // 50 unidades por quadro, a = 30
      object.updateMatrixWorld()
      sonda.sample(object, dt)
    }
    expect(sonda.input.linear[0]).toBeCloseTo(-30, 0)
  })

  it('um salto grande não vira tranco', () => {
    const sonda = probe()
    const object = new THREE.Object3D()
    for (const x of [0, 0, 0, 500, 500]) {
      object.position.set(x, 0, 0)
      object.updateMatrixWorld()
      sonda.sample(object, 1 / 60)
    }
    expect(Math.hypot(...sonda.input.linear)).toBe(0)
  })

  it('satura suavemente as acelerações enormes', () => {
    const sonda = new InertiaProbe({ gain: 1, maxLinear: 10, angularGain: 1, maxAngular: 2, smoothing: 1e-6 })
    const object = new THREE.Object3D()
    const dt = 1 / 60
    for (let k = 0; k < 4; k++) {
      object.position.set(1000 * (k * dt) ** 2, 0, 0)
      object.rotation.z = 50 * (k * dt) ** 2
      object.updateMatrixWorld()
      sonda.sample(object, dt)
    }
    expect(Math.hypot(...sonda.input.linear)).toBeLessThan(10)
    expect(Math.hypot(...sonda.input.linear)).toBeGreaterThan(9)
    // aceleração angular em z (100 rad/s²) saturada abaixo de 2
    expect(sonda.input.angular[2]).toBeGreaterThan(1.9)
    expect(sonda.input.angular[2]).toBeLessThan(2)
  })
})

/**
 * Escolta como o ShipRig a monta: a câmera orbita (mola criticamente amortecida, como o CameraControls), a nave
 * fica em câmera + lagQuat·local (lagQuat seguindo a câmera a 5/s), olha para a câmera em três-quartos
 * (slerp a 6/s), flutua (OctocatShip) e o piloto entra pelo COCKPIT. A sonda lê o grupo do piloto.
 */
function escortScene({ hover = false, local: spot = [1.1, -0.7, -3] as [number, number, number], side = 1 } = {}) {
  const camera = new THREE.PerspectiveCamera(45, 1.4, 0.1, 1000)
  const rig = new THREE.Group()
  rig.scale.setScalar(SHIP_SCALE)
  const root = new THREE.Group()
  const cockpit = new THREE.Group()
  cockpit.position.set(...COCKPIT.position)
  cockpit.scale.setScalar(COCKPIT.scale)
  const pilot = new THREE.Group()
  rig.add(root)
  root.add(cockpit)
  cockpit.add(pilot)
  const lag = new THREE.Quaternion()
  const helper = new THREE.Object3D()
  // canto da escolta (ordem de grandeza do placementOffset) ou o ponto da visita em primeiro plano (visitLocal)
  const local = new THREE.Vector3(...spot)
  const state = { azimuth: 0, azimuthVel: 0, azimuthGoal: 0, radius: 30, radiusVel: 0, radiusGoal: 30, closer: 0, t: 0 }
  const smooth = (x: number, v: number, goal: number, dt: number, time = 0.6) => {
    const omega = 2 / time
    const e = goal - x
    const a = omega * omega * e - 2 * omega * v
    return [x + (v + a * dt) * dt, v + a * dt]
  }
  const place = (dt: number, first: boolean) => {
    ;[state.azimuth, state.azimuthVel] = smooth(state.azimuth, state.azimuthVel, state.azimuthGoal, dt)
    ;[state.radius, state.radiusVel] = smooth(state.radius, state.radiusVel, state.radiusGoal, dt)
    camera.position.set(Math.sin(state.azimuth), 0.35, Math.cos(state.azimuth)).multiplyScalar(state.radius)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    if (first) lag.copy(camera.quaternion)
    else lag.slerp(camera.quaternion, 1 - Math.exp(-5 * dt))
    rig.position.copy(local).multiplyScalar(1 - ESCORT_LEAN_DEPTH * state.closer).applyQuaternion(lag).add(camera.position)
    helper.position.copy(rig.position)
    helper.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    helper.lookAt(camera.position)
    helper.rotateY(-side * THREE_QUARTER_YAW)
    if (first) rig.quaternion.copy(helper.quaternion)
    else rig.quaternion.slerp(helper.quaternion, 1 - Math.exp(-6 * dt))
    const h = hover ? hoverOffset(state.t) : { y: 0, roll: 0 }
    root.position.y = h.y
    root.rotation.z = h.roll
    rig.updateMatrixWorld(true)
  }
  /** Roda `seconds` medindo contra a câmera (ou o mundo) e devolve o pico das entradas. */
  const run = (probe: InertiaProbe, seconds: number, frame: 'camera' | 'world', dt = 1 / 60) => {
    const peak = { linear: 0, angular: 0 }
    for (let k = 0; k < Math.round(seconds / dt); k++) {
      state.t += dt
      place(dt, false)
      const input = probe.sample(pilot, dt, frame === 'camera' ? camera : null)
      peak.linear = Math.max(peak.linear, Math.hypot(...input.linear))
      peak.angular = Math.max(peak.angular, Math.hypot(...input.angular))
    }
    return peak
  }
  place(1 / 60, true)
  return { state, run, camera, pilot }
}

describe('referencial da inércia por modo', () => {
  it('entrada, escolta e visita (em primeiro plano, presa à câmera) contra a câmera; viagem e volta contra o mundo', () => {
    expect(inertiaFrameFor('entering')).toBe('camera')
    expect(inertiaFrameFor('escort')).toBe('camera')
    expect(inertiaFrameFor('visiting')).toBe('camera')
    expect(inertiaFrameFor('traveling')).toBe('world')
    expect(inertiaFrameFor('returning')).toBe('world')
  })
})

describe('InertiaProbe na visita em primeiro plano (contra a câmera)', () => {
  // ponto da visita: à esquerda e abaixo, mais fundo que a escolta, nariz para o alvo (o outro lado)
  const visit = { local: [-1.3, -0.8, -3.6] as [number, number, number], side: -1 }
  const quiet = { linear: 0.15 * PILOT_INERTIA.maxLinear, angular: 0.15 * PILOT_INERTIA.maxAngular }

  it('girar a câmera em volta do planeta (3°) quase não balança; contra o mundo bateria no teto', () => {
    const scene = escortScene(visit)
    const probe = new InertiaProbe(PILOT_INERTIA)
    scene.run(probe, 2, 'camera')
    scene.state.azimuthGoal += (3 * Math.PI) / 180
    const peak = scene.run(probe, 3, 'camera')
    expect(peak.linear).toBeLessThan(quiet.linear)
    expect(peak.angular).toBeLessThan(quiet.angular)

    const world = escortScene(visit)
    const worldProbe = new InertiaProbe(PILOT_INERTIA)
    world.run(worldProbe, 2, 'world')
    world.state.azimuthGoal += (3 * Math.PI) / 180
    expect(world.run(worldProbe, 3, 'world').linear).toBeGreaterThan(0.6 * PILOT_INERTIA.maxLinear)
  })

  it('entrar e sair da visita (troca de referencial) recomeça a sonda, sem tranco', () => {
    const scene = escortScene(visit)
    const probe = new InertiaProbe(PILOT_INERTIA)
    scene.run(probe, 1, 'world')
    // chega: passa a medir contra a câmera; sai: volta ao mundo
    const into = probe.sample(scene.pilot, 1 / 60, scene.camera)
    expect(Math.hypot(...into.linear) + Math.hypot(...into.angular)).toBe(0)
    scene.run(probe, 1, 'camera')
    const out = probe.sample(scene.pilot, 1 / 60, null)
    expect(Math.hypot(...out.linear) + Math.hypot(...out.angular)).toBe(0)
  })
})

describe('InertiaProbe na escolta (contra a câmera)', () => {
  const settled = (hover = false) => {
    const scene = escortScene({ hover })
    const probe = new InertiaProbe(PILOT_INERTIA)
    scene.run(probe, 2, 'camera')
    return { ...scene, probe }
  }
  const quiet = { linear: 0.15 * PILOT_INERTIA.maxLinear, angular: 0.15 * PILOT_INERTIA.maxAngular }

  it('girar a câmera 3° quase não balança (abaixo de 15% do teto)', () => {
    const { state, run, probe } = settled()
    state.azimuthGoal += (3 * Math.PI) / 180
    const peak = run(probe, 3, 'camera')
    expect(peak.linear).toBeLessThan(quiet.linear)
    expect(peak.angular).toBeLessThan(quiet.angular)
  })

  it('um zoom não balança; um giro grande (46°) fica bem abaixo do teto', () => {
    const { state, run, probe } = settled()
    state.radiusGoal = 15
    const zoom = run(probe, 3, 'camera')
    expect(zoom.linear).toBeLessThan(quiet.linear)
    expect(zoom.angular).toBeLessThan(quiet.angular)
    // o que sobra num giro grande é a nave virando de verdade na tela (o ShipRig gira a nave a 6/s atrás
    // do referencial da escolta): um balanço moderado, não o da viagem
    state.azimuthGoal += 0.8
    const orbit = run(probe, 3, 'camera')
    expect(orbit.linear).toBeLessThan(0.5 * PILOT_INERTIA.maxLinear)
    expect(orbit.angular).toBeLessThan(0.5 * PILOT_INERTIA.maxAngular)
  })

  it('medido contra o mundo, o mesmo giro de 3° bate no teto (o defeito que a câmera resolve)', () => {
    const scene = escortScene()
    const probe = new InertiaProbe(PILOT_INERTIA)
    scene.run(probe, 2, 'world')
    scene.state.azimuthGoal += (3 * Math.PI) / 180
    expect(scene.run(probe, 3, 'world').linear).toBeGreaterThan(0.6 * PILOT_INERTIA.maxLinear)
  })

  it('a flutuação e a batida no vidro continuam balançando', () => {
    const floating = settled(true)
    expect(floating.run(floating.probe, 4, 'camera').linear).toBeGreaterThan(1)

    const { state, run, probe } = settled()
    const knock = { closer: 0, bob: 0, waving: false }
    const peak = { linear: 0 }
    for (let k = 0; k < 200; k++) {
      knockPose(k / 60, knock)
      state.closer = knock.closer + knock.bob * 0.15
      peak.linear = Math.max(peak.linear, run(probe, 1 / 60, 'camera').linear)
    }
    expect(peak.linear).toBeGreaterThan(quiet.linear)
  })

  it('trocar de referencial não injeta tranco', () => {
    // nave presa à câmera, que anda a 20 unidades/s: contra o mundo, velocidade constante; contra a câmera, parada
    const camera = new THREE.Object3D()
    const ship = new THREE.Object3D()
    ship.position.set(1, -0.5, -3)
    ship.scale.setScalar(0.1)
    camera.add(ship)
    const probe = new InertiaProbe(PILOT_INERTIA)
    const dt = 1 / 60
    let peak = 0
    for (let k = 0; k < 60; k++) {
      camera.position.set(20 * k * dt, 0, 0)
      camera.updateMatrixWorld(true)
      // alterna mundo → câmera → mundo a cada 20 quadros
      const input = probe.sample(ship, dt, Math.floor(k / 20) === 1 ? camera : null)
      peak = Math.max(peak, Math.hypot(...input.linear), Math.hypot(...input.angular))
    }
    expect(peak).toBeLessThan(1e-3)
  })

  it('um quadro longo (aba em segundo plano) recomeça em vez de dar tranco', () => {
    const { run, probe, pilot, camera } = settled(true)
    const normal = run(probe, 2, 'camera').linear
    const input = probe.sample(pilot, 5, camera)
    expect(Math.hypot(...input.linear)).toBe(0)
    expect(run(probe, 0.5, 'camera').linear).toBeLessThanOrEqual(normal * 1.05)
  })

  it('na viagem (contra o mundo) a aceleração ainda balança bem', () => {
    const object = new THREE.Object3D()
    object.scale.setScalar(SHIP_SCALE * COCKPIT.scale)
    const probe = new InertiaProbe(PILOT_INERTIA)
    const dt = 1 / 60
    const ease = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2)
    let peak = 0
    for (let k = 0; k <= 120; k++) {
      object.position.set(40 * ease(k / 120), 0, 0) // 40 unidades em 2 s, como uma viagem curta
      object.updateMatrixWorld()
      peak = Math.max(peak, Math.hypot(...probe.sample(object, dt).linear))
    }
    expect(peak).toBeGreaterThan(0.6 * PILOT_INERTIA.maxLinear)
  })
})
