import { describe, expect, it } from 'vitest'
import { planetFocusPose, sunPose, type PanelLayout, type Pose } from '../cameraPoses'
import { DESKTOP_MIN_WIDTH, reservedRects, UI_GAP, type Rect } from '../uiLayout'
import { barycenterOffset } from '../universe/barycenter'
import { buildOrbits, planetPosition, SUN_RADIUS, type Vec3 } from '../universe/orbits'
import { blendFramesPoint, frameFromPose, frameToLocal } from './cameraFrame'
import { MIN_SHIP_DISTANCE, shipFaceBox, shipScreenBox } from './escort'
import { length, sub } from './vec'
import { projectDisc, VISIT_DESKTOP, VISIT_PHONE, visitFraming, visitLocal, visitPlacement, type Disc } from './visit'

const FOV = 50
const system = buildOrbits(Array.from({ length: 12 }, (_, i) => ({ name: `p${i}`, radius: 0.8 + (i % 4) * 0.7 })))
const sizes: [string, number, number][] = [
  ['1280×800', 1280, 800],
  ['1920×1080', 1920, 1080],
  ['1366×768', 1366, 768],
  ['375×667', 375, 667],
  ['390×844', 390, 844],
]

const overlaps = (a: Rect, b: Rect, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
const inside = (r: Rect, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h
/** A caixa cobre o centro do disco (com um miolo de folga)? */
function coversCenter(box: Rect, disc: Disc) {
  const core = Math.max(0.35 * disc.r, 10)
  const cx = Math.min(Math.max(disc.x, box.x), box.x + box.w)
  const cy = Math.min(Math.max(disc.y, box.y), box.y + box.h)
  return Math.hypot(cx - disc.x, cy - disc.y) < core
}

interface Scene {
  label: string
  pose: Pose
  center: Vec3
  radius: number
}

function scenes(layout: PanelLayout): Scene[] {
  const out: Scene[] = []
  for (const name of ['p0', 'p3', 'p6', 'p11']) {
    const orbit = system.orbits.find((o) => o.name === name)!
    const center = planetPosition(system.rings[orbit.ring], orbit, 13)
    out.push({ label: name, pose: planetFocusPose(system, name, 13, layout)!, center, radius: orbit.radius })
  }
  const sun = barycenterOffset(system, 13)
  out.push({ label: 'sol', pose: sunPose(layout, sun), center: sun, radius: SUN_RADIUS })
  return out
}

describe('nave em primeiro plano ao apresentar um planeta', () => {
  for (const [label, W, H] of sizes) {
    const phone = W < DESKTOP_MIN_WIDTH
    const layout: PanelLayout = phone ? 'bottom' : 'side'
    for (const ui of ['painel', 'apresentação'] as const) {
      it(`${label}, com ${ui}: não cobre a interface nem o centro do alvo; rosto na tela; tamanho certo`, () => {
        const reserved = reservedRects(W, H, ui === 'painel' ? { panel: true } : { presentation: true })
        for (const sc of scenes(layout)) {
          const disc = projectDisc(sc.pose, sc.center, sc.radius, W, H, FOV)!
          expect(disc).not.toBeNull()
          const p = visitPlacement({ width: W, height: H, reserved, disc })
          expect(p.fits).toBe(true)
          const box = shipScreenBox(p, H)
          for (const r of reserved) expect(overlaps(box, r, UI_GAP - 1e-6)).toBe(false)
          expect(coversCenter(box, disc)).toBe(false)
          expect(inside(box, W, H)).toBe(true)
          expect(inside(shipFaceBox(p, H), W, H)).toBe(true)
          const framing = visitFraming(W, H)
          expect(framing).toBe(phone ? VISIT_PHONE : VISIT_DESKTOP)
          expect(p.heightFraction).toBeLessThanOrEqual(framing.heightFraction + 1e-9)
          expect(p.heightFraction).toBeGreaterThanOrEqual(framing.minHeightFraction - 1e-9)
          // ao lado do alvo, como quem apresenta: perto da borda do disco
          expect(Math.hypot(p.centerX - disc.x, p.centerY - disc.y)).toBeLessThan(disc.r + box.w + 0.2 * H)
          // de frente, em três-quartos, com o nariz para o alvo
          expect(p.side).toBe(disc.x < p.centerX ? 1 : -1)
        }
      })
    }
  }

  it('desktop ~15–20% da altura; celular ~12%', () => {
    expect(VISIT_DESKTOP.heightFraction).toBeGreaterThanOrEqual(0.15)
    expect(VISIT_DESKTOP.heightFraction).toBeLessThanOrEqual(0.2)
    expect(VISIT_PHONE.heightFraction).toBeCloseTo(0.12)
  })

  it('no referencial da câmera: entre a lente e o alvo, fora do plano próximo, no ponto da tela pedido', () => {
    const W = 1280
    const H = 800
    for (const sc of scenes('side')) {
      const disc = projectDisc(sc.pose, sc.center, sc.radius, W, H, FOV)!
      const p = visitPlacement({ width: W, height: H, reserved: reservedRects(W, H, { panel: true }), disc })
      const local = visitLocal(p, W, H, FOV)
      const target = frameToLocal(frameFromPose(sc.pose), sc.center)
      expect(length(local)).toBeGreaterThan(MIN_SHIP_DISTANCE)
      expect(-local[2]).toBeLessThan(-target[2])
      // a altura na tela bate com a fração pedida (a nave mede SHIP_WORLD_HEIGHT)
      const tanY = Math.tan((FOV * Math.PI) / 360)
      const fraction = 0.497 / (2 * -local[2] * tanY)
      expect(fraction).toBeCloseTo(p.heightFraction, 2)
    }
  })

  it('a mistura do referencial da pose para o da câmera de agora é contínua (sem salto)', () => {
    const W = 1280
    const H = 800
    const sc = scenes('side')[1]
    const disc = projectDisc(sc.pose, sc.center, sc.radius, W, H, FOV)!
    const local = visitLocal(visitPlacement({ width: W, height: H, reserved: reservedRects(W, H, { panel: true }), disc }), W, H, FOV)
    const goal = frameFromPose(sc.pose)
    const live = frameFromPose({ position: [sc.pose.position[0] + 3, sc.pose.position[1] + 1, sc.pose.position[2] - 2], target: sc.pose.target })
    let prev = blendFramesPoint(goal, live, 0, local)
    for (let i = 1; i <= 100; i++) {
      const p = blendFramesPoint(goal, live, i / 100, local)
      expect(length(sub(p, prev))).toBeLessThan(0.1)
      prev = p
    }
    expect(length(sub(blendFramesPoint(goal, live, 1, local), blendFramesPoint(live, live, 0, local)))).toBeLessThan(1e-12)
  })

  it('alvo atrás da câmera não tem disco', () => {
    expect(projectDisc({ position: [0, 0, 0], target: [0, 0, -1] }, [0, 0, 5], 1, 800, 600, FOV)).toBeNull()
  })
})
