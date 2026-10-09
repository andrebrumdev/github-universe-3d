import { describe, expect, it } from 'vitest'
import { planetFocusPose } from '../cameraPoses'
import { reservedRects } from '../uiLayout'
import { barycenterOffset } from '../universe/barycenter'
import { buildOrbits } from '../universe/orbits'
import { bodyExtent } from '../universe/planets'
import { frameFromPose, frameToWorld } from './cameraFrame'
import { CHASE_SPRING, chasePose, MIN_SHIP_DISTANCE, MAX_CHASE_LEAD, springLead, springStep, type Spring3 } from './escort'
import { planTransfer, travelBodies } from './transfer'
import { travelPoint, travelTangent, travelVelocity } from './travel'
import { length, sub } from './vec'
import { projectDisc, visitLocal, visitPlacement } from './visit'

/**
 * Viagens a partir da visita em primeiro plano (a nave a ~3 unidades da lente), com a câmera de perseguição
 * simulada como no CameraRig (mola na pose de perseguição, com antecipação limitada). A saída perto da lente
 * (`lens`) precisa manter a nave longe da câmera o tempo todo, sem depender do keepAway do ShipRig.
 */
const RADII = [3, 2.67, 2.34, 2.16, 1.72, 1.61, 1.43, 1.3, 1.15, 0.97, 0.86, 0.68, 0.59, 0.45]
const system = buildOrbits(RADII.map((radius, i) => ({ name: `p${i}`, radius, extent: bodyExtent(radius, i % 4), trojans: i % 3 === 0 })))
const W = 1440
const H = 900
const FOV = 50

function visitSpot(name: string, t: number) {
  const pose = planetFocusPose(system, name, t, 'side')!
  const orbit = system.orbits.find((o) => o.name === name)!
  const center = travelBodies(system, t).find((b) => b.name === name)!.position
  const disc = projectDisc(pose, center, orbit.radius, W, H, FOV)!
  const p = visitPlacement({ width: W, height: H, reserved: reservedRects(W, H, { panel: true }), disc })
  const goal = frameFromPose(pose)
  return { pose, goal, world: frameToWorld(goal, visitLocal(p, W, H, FOV)) }
}

function closestToChaseCamera(lensAware: boolean, epochs: number[]) {
  const dt = 1 / 60
  const mins: number[] = []
  for (const t of epochs) {
    const names = system.orbits.map((o) => o.name)
    const spots = new Map(names.map((n) => [n, visitSpot(n, t)]))
    for (const a of names) {
      for (const b of names) {
        if (a === b) continue
        const A = spots.get(a)!
        const B = spots.get(b)!
        const path = planTransfer(A.world, B.world, {
          sun: barycenterOffset(system, t),
          bodies: travelBodies(system, t),
          exclude: b,
          lens: lensAware ? A.goal : null,
        })
        let cam: Spring3 = { position: [...A.pose.position], velocity: [0, 0, 0] }
        let min = Infinity
        for (let s = 0; s <= path.duration; s += dt) {
          const p = travelPoint(path, s)
          const raw = chasePose(p, travelTangent(path, s))
          cam = springStep(cam, springLead(raw.position, travelVelocity(path, s), CHASE_SPRING, MAX_CHASE_LEAD), CHASE_SPRING, dt)
          min = Math.min(min, length(sub(cam.position, p)))
        }
        mins.push(min)
      }
    }
  }
  return mins
}

describe('saindo da visita em primeiro plano, a nave nunca atravessa a lente', () => {
  it('com a câmera de perseguição, nunca mais perto que MIN_SHIP_DISTANCE (meia envergadura + plano próximo + folga)', () => {
    const mins = closestToChaseCamera(true, [0, 11, 23])
    expect(mins.length).toBe(3 * 14 * 13)
    expect(Math.min(...mins)).toBeGreaterThanOrEqual(MIN_SHIP_DISTANCE)
    // e quase sempre bem longe (a nave enche ≥ ⅓ da tela abaixo de ~1,5)
    expect(mins.filter((m) => m < 2 * MIN_SHIP_DISTANCE).length / mins.length).toBeLessThan(0.03)
  }, 60_000)
})
