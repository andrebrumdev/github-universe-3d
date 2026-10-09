import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { trailHalfWidth } from './trailMaterial'
import { Ribbon, TRAIL_CAPACITY, TRAIL_SECONDS, TrailRibbon } from './trailRibbon'

const EYE = new THREE.Vector3(0, 20, 0)
const head = new THREE.Vector3()

/** Voa em linha reta em +x a `speed` u/s, a 60 quadros por segundo, durante `seconds`. */
function fly(ribbon: TrailRibbon, seconds: number, speed = 10, heat = 0.5, t0 = 0) {
  const frames = Math.round(seconds * 60)
  for (let i = 0; i <= frames; i++) {
    const t = t0 + i / 60
    ribbon.update(head.set(speed * t, 0, 0), t, EYE, heat)
  }
}

const data = (r: TrailRibbon) => r.geometry.getAttribute('aTrail') as THREE.BufferAttribute
const pos = (r: TrailRibbon) => r.geometry.getAttribute('position') as THREE.BufferAttribute
/** Quantos pontos (pares de vértices) a faixa desenha. */
const points = (r: TrailRibbon) => (r.geometry.drawRange.count === 0 ? 0 : r.geometry.drawRange.count / 6 + 1)

describe('faixa do rastro', () => {
  it('nasce vazia: nada desenhado antes de a nave andar', () => {
    const r = new TrailRibbon()
    expect(r.geometry.drawRange.count).toBe(0)
    r.update(head.set(1, 2, 3), 0, EYE, 0.5)
    expect(r.geometry.drawRange.count).toBe(0)
    r.dispose()
  })

  it('começa no bocal (idade 0) e termina na cauda (idade 1), com a idade crescendo', () => {
    const r = new TrailRibbon()
    fly(r, 2)
    const n = points(r)
    expect(n).toBeGreaterThan(30)
    expect(n).toBeLessThanOrEqual(TRAIL_CAPACITY + 1)
    const d = data(r)
    expect(d.getX(0)).toBe(0)
    expect(d.getX(1)).toBe(0)
    expect(d.getX(2 * (n - 1))).toBe(1)
    for (let i = 1; i < n; i++) expect(d.getX(2 * i)).toBeGreaterThanOrEqual(d.getX(2 * (i - 1)))
    // o par da cabeça fica em volta do bocal
    const p = pos(r)
    const mid = new THREE.Vector3((p.getX(0) + p.getX(1)) / 2, (p.getY(0) + p.getY(1)) / 2, (p.getZ(0) + p.getZ(1)) / 2)
    expect(mid.distanceTo(head)).toBeLessThan(1e-5)
    r.dispose()
  })

  it('cobre só o último TRAIL_SECONDS do voo', () => {
    const r = new TrailRibbon()
    const speed = 10
    fly(r, 3, speed)
    const p = pos(r)
    const tail = 2 * (points(r) - 1)
    const tailX = (p.getX(tail) + p.getX(tail + 1)) / 2
    // a cauda está ~ speed × TRAIL_SECONDS atrás do bocal (uma amostra de folga)
    expect(head.x - tailX).toBeGreaterThan(speed * TRAIL_SECONDS - 1e-6)
    expect(head.x - tailX).toBeLessThan(speed * (TRAIL_SECONDS + 2 / 60) + 1e-6)
    r.dispose()
  })

  it('a faixa fica de frente para a câmera e afina com a idade', () => {
    const r = new TrailRibbon()
    fly(r, 2, 10, 0.8)
    const p = pos(r)
    const d = data(r)
    const n = points(r)
    for (const i of [0, Math.floor(n / 2), n - 1]) {
      const a = new THREE.Vector3(p.getX(2 * i), p.getY(2 * i), p.getZ(2 * i))
      const b = new THREE.Vector3(p.getX(2 * i + 1), p.getY(2 * i + 1), p.getZ(2 * i + 1))
      const across = b.clone().sub(a)
      // movimento em x, câmera em cima (y): a largura vai em z, perpendicular aos dois
      expect(Math.abs(across.x)).toBeLessThan(1e-5)
      expect(Math.abs(across.y)).toBeLessThan(1e-5)
      expect(across.length() / 2).toBeCloseTo(trailHalfWidth(d.getX(2 * i), 0.8), 5)
      expect(d.getW(2 * i)).toBeCloseTo(trailHalfWidth(d.getX(2 * i), 0.8), 5)
      expect(d.getY(2 * i)).toBe(-1)
      expect(d.getY(2 * i + 1)).toBe(1)
    }
    r.dispose()
  })

  it('odômetro: cada ponto guarda a distância percorrida até ele (as brasas ficam presas no espaço)', () => {
    const r = new TrailRibbon()
    fly(r, 2, 10)
    const d = data(r)
    const n = points(r)
    expect(d.getZ(0)).toBeCloseTo(20, 4)
    for (let i = 1; i < n; i++) expect(d.getZ(2 * i)).toBeLessThan(d.getZ(2 * (i - 1)))
    r.dispose()
  })

  it('parada (queima de partida), sem tangente: nada de NaN', () => {
    const r = new TrailRibbon()
    for (let i = 0; i < 30; i++) r.update(head.set(5, 5, 5), i / 60, EYE, 0)
    const p = pos(r).array as Float32Array
    for (const v of p) expect(Number.isFinite(v)).toBe(true)
    r.dispose()
  })

  it('reaproveita os buffers: nenhum atributo novo por quadro', () => {
    const r = new TrailRibbon()
    const before = pos(r).array
    const beforeData = data(r).array
    fly(r, 1)
    expect(pos(r).array).toBe(before)
    expect(data(r).array).toBe(beforeData)
    r.dispose()
  })

  it('quadro lento (fps baixo): a faixa usa o que tem, sem passar da capacidade', () => {
    const r = new TrailRibbon()
    for (let i = 0; i < 400; i++) r.update(head.set(i * 0.01, 0, 0), i / 240, EYE, 0.5)
    expect(points(r)).toBeLessThanOrEqual(TRAIL_CAPACITY + 1)
    r.dispose()
  })
})

describe('emissão e faixa genérica', () => {
  /** Voa em +x, a 60 qps, com a emissão pedida. */
  function flyEmit(ribbon: Ribbon, from: number, seconds: number, emit: number, speed = 10) {
    const frames = Math.round(seconds * 60)
    for (let i = 1; i <= frames; i++) {
      const t = from + i / 60
      ribbon.update(head.set(speed * t, 0, 0), t, EYE, 0.5, emit)
    }
    return from + frames / 60
  }

  it('motor desligado: nada novo sai quente (largura 0 da cabeça para trás), o que já saiu envelhece e some', () => {
    const r = new TrailRibbon()
    let t = flyEmit(r, 0, 0.5, 1)
    t = flyEmit(r, t, 0.3, 0)
    const d = data(r)
    const n = points(r)
    expect(d.getW(0)).toBe(0)
    let hot = 0
    for (let i = 0; i < n; i++) {
      const age = d.getX(2 * i) * TRAIL_SECONDS
      if (age < 0.28) expect(d.getW(2 * i)).toBe(0)
      if (age > 0.32 && age < 0.75) {
        expect(d.getW(2 * i)).toBeCloseTo(trailHalfWidth(d.getX(2 * i), 0.5), 6)
        hot++
      }
    }
    expect(hot).toBeGreaterThan(10)
    flyEmit(r, t, TRAIL_SECONDS + 0.1, 0)
    for (let i = 0; i < points(r); i++) expect(data(r).getW(2 * i)).toBe(0)
    r.dispose()
  })

  it('emissão parcial afina a faixa na mesma proporção', () => {
    const r = new TrailRibbon()
    flyEmit(r, 0, 0.5, 0.25)
    const d = data(r)
    for (let i = 0; i < points(r); i++) expect(d.getW(2 * i)).toBeCloseTo(0.25 * trailHalfWidth(d.getX(2 * i), 0.5), 6)
    r.dispose()
  })

  it('clear: esvazia entre viagens (o próximo voo não liga no ponto antigo)', () => {
    const r = new TrailRibbon()
    flyEmit(r, 0, 1, 1)
    r.clear()
    expect(r.geometry.drawRange.count).toBe(0)
    r.update(head.set(500, 0, 0), 10, EYE, 0.5, 1)
    expect(r.geometry.drawRange.count).toBe(0)
    r.update(head.set(500.2, 0, 0), 10 + 1 / 60, EYE, 0.5, 1)
    expect(points(r)).toBe(2)
    expect(data(r).getZ(0) - data(r).getZ(2)).toBeCloseTo(0.2, 4)
    r.dispose()
  })

  it('duração, capacidade e largura próprias (rastro de vapor: mais longo e alargando com a idade)', () => {
    const r = new Ribbon({ seconds: 1.8, capacity: 120, sampleInterval: 1 / 60, halfWidth: (age) => 0.01 * (1 + age) })
    flyEmit(r, 0, 3, 1)
    const n = points(r)
    expect(n).toBeLessThanOrEqual(121)
    const p = pos(r)
    const tail = 2 * (n - 1)
    const tailX = (p.getX(tail) + p.getX(tail + 1)) / 2
    expect(head.x - tailX).toBeGreaterThan(10 * 1.8 - 1e-6)
    expect(head.x - tailX).toBeLessThan(10 * (1.8 + 2 / 60) + 1e-6)
    const d = data(r)
    for (let i = 1; i < n; i++) expect(d.getW(2 * i)).toBeGreaterThanOrEqual(d.getW(2 * (i - 1)))
    expect(d.getW(tail)).toBeCloseTo(0.02, 6)
    r.dispose()
  })
})
