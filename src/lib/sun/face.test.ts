import { describe, expect, it } from 'vitest'
import { browArch, browBar, BUBBLE, EYE, FACE_CENTER, hasLidCap, hasPupils, hasSparkle, LID, MOUTH_Y, PUPIL, PUPIL_REACH, pupilLook, sideEyes, VIAJANDO } from './face'
import { SUN_EXPRESSIONS } from './sunMachine'
import { SUN_LOOK } from './sunMachine'
import type { SunExpression } from './sunMachine'

/** Expressões de olhos abertos (com pupila). */
const EXPRESSIONS: SunExpression[] = ['serious', 'watching', 'happy', 'surprised', 'sad', 'admiring']
/** Com sobrancelha (por humor). */
const BROWED: SunExpression[] = ['serious', 'happy', 'surprised', 'sad', 'admiring']

describe('pupilas que olham para a câmera', () => {
  it('sem atraso da mola (rosto já de frente para a câmera): pupila no repouso da expressão', () => {
    for (const e of EXPRESSIONS) expect(pupilLook(e, 0, 0)).toEqual([PUPIL[e].x, PUPIL[e].y, PUPIL[e].r])
  })

  it('adianta o olhar: câmera à direita → pupila à direita; câmera acima → pupila para cima', () => {
    const [x] = pupilLook('happy', 0.2, 0)
    expect(x).toBeGreaterThan(PUPIL.happy.x)
    const [, y] = pupilLook('happy', 0, 0.2)
    expect(y).toBeLessThan(PUPIL.happy.y)
  })

  it('anda no máximo PUPIL_REACH, em qualquer direção', () => {
    for (const [yaw, pitch] of [[3, 0], [0, -3], [2, 2], [-1, 0.5]]) {
      const [x, y] = pupilLook('happy', yaw, pitch)
      expect(Math.hypot(x - PUPIL.happy.x, y - PUPIL.happy.y)).toBeLessThanOrEqual(PUPIL_REACH + 1e-9)
    }
  })

  it('a pupila inteira fica dentro do branco do olho, no repouso e no alcance máximo', () => {
    for (const e of EXPRESSIONS) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2
        const [cx, cy, r] = pupilLook(e, Math.cos(a), Math.sin(a))
        for (let j = 0; j < 32; j++) {
          const b = (j / 32) * Math.PI * 2
          const px = cx + r * Math.cos(b)
          const py = cy + r * Math.sin(b)
          expect((px / EYE.rx) ** 2 + (py / EYE.ry) ** 2).toBeLessThanOrEqual(1.0001)
        }
      }
    }
  })

  it('escreve no vetor de saída (nada alocado por quadro)', () => {
    const out: [number, number, number] = [0, 0, 0]
    expect(pupilLook('sad', 0.1, 0.1, out)).toBe(out)
  })
})

/** Unidade de desenho → radianos na esfera (mapa 512 de largura = 2π). */
const RAD = (2 * Math.PI) / 512
/** Fração do diâmetro do disco que um traço ocupa visto de frente, perto do centro. */
const ofDiameter = (units: number) => Math.sin(units * RAD) / 2

describe('rosto como no Sphere (referências 1 e 2)', () => {
  it('olhos redondos, cada um com ~10–12% do diâmetro, separados por ~uma largura de olho', () => {
    expect(EYE.rx).toBe(EYE.ry)
    const eye = ofDiameter(2 * EYE.rx)
    expect(eye).toBeGreaterThanOrEqual(0.1)
    expect(eye).toBeLessThanOrEqual(0.12)
    const gap = 2 * EYE.dx - 2 * EYE.rx
    expect(gap / (2 * EYE.rx)).toBeGreaterThan(0.8)
    expect(gap / (2 * EYE.rx)).toBeLessThan(1.25)
  })

  it('pupila grande e redonda: metade do olho, aproximadamente', () => {
    for (const e of EXPRESSIONS) {
      expect(PUPIL[e].r / EYE.rx).toBeGreaterThan(0.38)
      expect(PUPIL[e].r / EYE.rx).toBeLessThan(0.56)
    }
  })

  it('rosto um pouco abaixo do equador, boca pequena logo abaixo dos olhos', () => {
    expect(EYE.y).toBeGreaterThan(0) // y do canvas cresce para baixo
    expect(MOUTH_Y).toBeGreaterThan(EYE.y + EYE.ry)
    expect(MOUTH_Y - EYE.y).toBeLessThan(3 * EYE.ry)
    expect(FACE_CENTER).toEqual([128, 128])
  })

  it('sobrancelhas: barras retas logo acima dos olhos; no sério ficam niveladas; viajando e de olho não têm', () => {
    expect(browBar('viajando', -1)).toBeNull()
    expect(browBar('watching', 1)).toBeNull()
    for (const e of BROWED) {
      for (const side of [-1, 1] as const) {
        const [x1, y1, x2, y2] = browBar(e, side)!
        const length = Math.hypot(x2 - x1, y2 - y1)
        expect(length).toBeGreaterThan(1.6 * EYE.rx)
        expect(length).toBeLessThan(2.8 * EYE.rx)
        // logo acima do olho: o meio da barra fica entre 1 e 9 unidades acima do topo do branco
        const above = EYE.y - EYE.ry - (y1 + y2) / 2
        expect(above).toBeGreaterThan(1)
        expect(above).toBeLessThan(9)
        // centrada no olho do lado dela
        expect(Math.abs((x1 + x2) / 2 - side * EYE.dx)).toBeLessThan(2)
      }
    }
    const [, ly1, , ly2] = browBar('serious', -1)!
    expect(ly1).toBeCloseTo(ly2, 6)
  })

  it('cada expressão mexe nas sobrancelhas: feliz e surpreso levantam, triste inclina com a ponta de dentro para cima', () => {
    const mid = (e: SunExpression) => {
      const [, y1, , y2] = browBar(e, -1)!
      return (y1 + y2) / 2
    }
    expect(mid('happy')).toBeLessThan(mid('serious'))
    expect(mid('surprised')).toBeLessThan(mid('happy'))
    // olho esquerdo (side −1): a ponta de dentro é a da direita (x maior)
    const [lx1, ly1, lx2, ly2] = browBar('sad', -1)!
    const inner = lx1 > lx2 ? ly1 : ly2
    const outer = lx1 > lx2 ? ly2 : ly1
    expect(inner).toBeLessThan(outer - 1)
    // espelhado no olho direito
    const [rx1, ry1, rx2, ry2] = browBar('sad', 1)!
    const rInner = rx1 < rx2 ? ry1 : ry2
    expect(rInner).toBeCloseTo(inner, 6)
  })

  it('idle é o "viajando" (o padrão); hover é o feliz', () => {
    expect(SUN_LOOK.idle.expression).toBe('viajando')
    expect(SUN_LOOK.hover.expression).toBe('happy')
    expect(SUN_LOOK.click.expression).toBe('surprised')
    expect(SUN_LOOK.away.expression).toBe('sad')
  })
})

describe('viajando e de olho', () => {
  it('viajando não tem pupila; todas as de olhos abertos têm', () => {
    expect(hasPupils('viajando')).toBe(false)
    for (const e of EXPRESSIONS) expect(hasPupils(e)).toBe(true)
  })

  it('viajando: rosto um pouco à direita e abaixo; traços grossos do tamanho de um olho; bolinha no alto à direita', () => {
    expect(VIAJANDO.offsetX).toBeGreaterThan(0)
    expect(VIAJANDO.offsetY).toBeGreaterThanOrEqual(0)
    expect(2 * VIAJANDO.dashHalf).toBeGreaterThan(1.6 * EYE.rx)
    expect(VIAJANDO.dashWidth).toBeGreaterThan(2.5)
    expect(BUBBLE.x).toBeGreaterThan(EYE.dx + EYE.rx)
    expect(BUBBLE.y).toBeLessThan(EYE.y - EYE.ry)
    expect(BUBBLE.r).toBeLessThan(EYE.rx)
    // fica dentro da área calma do rosto (40°): a fervura não a entorta
    const RAD = (2 * Math.PI) / 512
    const x = VIAJANDO.offsetX + BUBBLE.x + BUBBLE.bobX + BUBBLE.r
    const y = VIAJANDO.offsetY + BUBBLE.y - BUBBLE.bobY - BUBBLE.r
    expect(Math.hypot(x, y) * RAD).toBeLessThan((40 * Math.PI) / 180)
  })

  it('pálpebra pesada só de olho: cobre o topo ~35–40% do branco', () => {
    expect(hasLidCap('watching')).toBe(true)
    for (const e of ['viajando', 'serious', 'happy', 'surprised', 'sad', 'admiring'] as const) expect(hasLidCap(e)).toBe(false)
    expect(LID.cover).toBeGreaterThanOrEqual(0.35)
    expect(LID.cover).toBeLessThanOrEqual(0.4)
  })

  it('sobrancelha e pálpebra pesada nunca juntas (nada de sobrancelha dupla), em todas as expressões', () => {
    for (const e of SUN_EXPRESSIONS) expect(browBar(e, -1) !== null && hasLidCap(e)).toBe(false)
  })

  it('admirando: sobrancelhas levantadas, macias (curvas) e com a ponta de dentro mais alta; brilho na pupila', () => {
    expect(browArch('admiring')).toBeGreaterThan(0)
    for (const e of ['serious', 'happy', 'surprised', 'sad'] as const) expect(browArch(e)).toBe(0)
    const [x1, y1, x2, y2] = browBar('admiring', -1)!
    const inner = x1 > x2 ? y1 : y2
    const outer = x1 > x2 ? y2 : y1
    expect(inner).toBeLessThan(outer)
    expect(hasSparkle('admiring')).toBe(true)
    for (const e of SUN_EXPRESSIONS.filter((x) => x !== 'admiring')) expect(hasSparkle(e)).toBe(false)
    expect(PUPIL.admiring.r).toBeGreaterThan(PUPIL.serious.r)
  })

  it('de olho e admirando: com a cabeça virada para um lado, a pupila encosta na borda do branco desse lado; os outros não', () => {
    expect(sideEyes('watching') && sideEyes('admiring')).toBe(true)
    expect(sideEyes('happy') || sideEyes('serious')).toBe(false)
    const [x] = pupilLook('watching', 0, 0, [0, 0, 0], 1.2, 0)
    expect(x - PUPIL.watching.x).toBeCloseTo(PUPIL_REACH)
    const [xl] = pupilLook('admiring', 0, 0, [0, 0, 0], -1.2, 0)
    expect(xl - PUPIL.admiring.x).toBeCloseTo(-PUPIL_REACH)
    expect(pupilLook('happy', 0, 0, [0, 0, 0], 1.2, 0)[0]).toBe(PUPIL.happy.x)
  })
})
