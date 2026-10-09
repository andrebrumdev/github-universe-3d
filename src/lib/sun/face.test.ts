import { describe, expect, it } from 'vitest'
import { EYE, PUPIL, PUPIL_REACH, pupilLook } from './face'
import type { SunExpression } from './sunMachine'

const EXPRESSIONS: SunExpression[] = ['happy', 'veryHappy', 'surprised', 'sad']

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
      const [x, y] = pupilLook('veryHappy', yaw, pitch)
      expect(Math.hypot(x - PUPIL.veryHappy.x, y - PUPIL.veryHappy.y)).toBeLessThanOrEqual(PUPIL_REACH + 1e-9)
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
