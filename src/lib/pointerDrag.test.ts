import { describe, expect, it } from 'vitest'
import { isTap, newPointerDrag, stepPointerDrag, type DragInput, type PointerDrag } from './pointerDrag'
import { MOUSE_TAP_SLOP, TAP_MAX_MS, TOUCH_TAP_SLOP } from './ship/focusGesture'

const mouseDown = (over: Partial<Extract<DragInput, { type: 'down' }>> = {}): DragInput => ({
  type: 'down',
  pointerId: 1,
  pointerType: 'mouse',
  button: 0,
  isPrimary: true,
  othersDown: 0,
  coarse: false,
  x: 100,
  y: 100,
  time: 0,
  ...over,
})
const move = (x: number, y = 100, over: Partial<Extract<DragInput, { type: 'move' }>> = {}): DragInput => ({
  type: 'move',
  pointerId: 1,
  x,
  y,
  buttons: 1,
  time: 50,
  ...over,
})
const up = (x = 100, y = 100, over: Partial<Extract<DragInput, { type: 'up' }>> = {}): DragInput => ({
  type: 'up',
  pointerId: 1,
  x,
  y,
  time: 100,
  remaining: 0,
  ...over,
})

function run(d: PointerDrag, ...inputs: DragInput[]) {
  return inputs.map((input) => stepPointerDrag(d, input))
}

describe('arrasto de um ponteiro (nave e sol)', () => {
  it('botão esquerdo, ponteiro primário e sozinho: começa (trava a câmera e pega a peça)', () => {
    const d = newPointerDrag()
    expect(stepPointerDrag(d, mouseDown())).toEqual({ kind: 'start' })
    expect(d.phase).toBe('pending')
  })

  it('botão direito, do meio, ponteiro não primário ou com outro dedo já na tela: ignora', () => {
    for (const down of [mouseDown({ button: 2 }), mouseDown({ button: 1 }), mouseDown({ isPrimary: false }), mouseDown({ othersDown: 1, pointerType: 'touch' })]) {
      const d = newPointerDrag()
      expect(stepPointerDrag(d, down)).toEqual({ kind: 'none' })
      expect(d.phase).toBe('idle')
    }
    // no toque, o "botão" é sempre o principal
    expect(stepPointerDrag(newPointerDrag(), mouseDown({ pointerType: 'touch', button: 0 })).kind).toBe('start')
  })

  it('dentro da folga é indeciso; passou dela, vira arrasto com todo o deslocamento desde o aperto', () => {
    const d = newPointerDrag()
    const [, a, b, c] = run(d, mouseDown(), move(100 + MOUSE_TAP_SLOP - 1), move(100 + MOUSE_TAP_SLOP + 4), move(130, 110))
    expect(a).toEqual({ kind: 'none' })
    expect(b).toEqual({ kind: 'move', dx: MOUSE_TAP_SLOP + 4, dy: 0 })
    expect(c).toEqual({ kind: 'move', dx: 130 - (100 + MOUSE_TAP_SLOP + 4), dy: 10 })
    expect(d.phase).toBe('drag')
  })

  it('no toque a folga é maior', () => {
    const d = newPointerDrag()
    stepPointerDrag(d, mouseDown({ pointerType: 'touch', coarse: true }))
    expect(stepPointerDrag(d, move(100 + MOUSE_TAP_SLOP + 2)).kind).toBe('none')
    expect(stepPointerDrag(d, move(100 + TOUCH_TAP_SLOP + 2)).kind).toBe('move')
  })

  it('soltou rápido sem andar: toque; depois de arrastar: solta com embalo, sem toque', () => {
    const tap = newPointerDrag()
    expect(run(tap, mouseDown(), up())[1]).toEqual({ kind: 'release', tap: true })
    expect(tap.phase).toBe('idle')
    const slow = newPointerDrag()
    expect(run(slow, mouseDown(), up(100, 100, { time: TAP_MAX_MS + 1 }))[1]).toEqual({ kind: 'release', tap: false })
    const drag = newPointerDrag()
    expect(run(drag, mouseDown(), move(160), up(160))[2]).toEqual({ kind: 'release', tap: false })
  })

  it('movimentos e solturas de outro ponteiro não contam', () => {
    const d = newPointerDrag()
    stepPointerDrag(d, mouseDown())
    expect(stepPointerDrag(d, move(300, 100, { pointerId: 9 })).kind).toBe('none')
    expect(stepPointerDrag(d, up(300, 100, { pointerId: 9, remaining: 1 })).kind).toBe('none')
    expect(d.phase).toBe('pending')
  })

  it('cada fim perdido encerra sem embalo e solta a trava: pointercancel/lostpointercapture, blur, aba escondida, menu de contexto', () => {
    const ends: DragInput[] = [
      { type: 'cancel', pointerId: 1, remaining: 0 },
      { type: 'interrupt' },
    ]
    for (const end of ends) {
      for (const before of [[], [move(200)]]) {
        const d = newPointerDrag()
        run(d, mouseDown(), ...before)
        expect(stepPointerDrag(d, end)).toEqual({ kind: 'abort' })
        expect(d.phase).toBe('idle')
      }
    }
    // cancelamento de outro ponteiro não encerra este
    const d = newPointerDrag()
    stepPointerDrag(d, mouseDown())
    expect(stepPointerDrag(d, { type: 'cancel', pointerId: 7, remaining: 1 }).kind).toBe('none')
  })

  it('movimento sem botão apertado (a soltura se perdeu): encerra sem embalo', () => {
    const d = newPointerDrag()
    run(d, mouseDown(), move(200))
    expect(stepPointerDrag(d, move(220, 100, { buttons: 0 }))).toEqual({ kind: 'abort' })
    expect(d.phase).toBe('idle')
  })

  it('parado, nada a encerrar', () => {
    const d = newPointerDrag()
    expect(stepPointerDrag(d, { type: 'interrupt' })).toEqual({ kind: 'none' })
    expect(stepPointerDrag(d, move(10))).toEqual({ kind: 'none' })
    expect(stepPointerDrag(d, up())).toEqual({ kind: 'none' })
  })

  it('pinça: um segundo dedo para o giro na hora (sem embalo) e o gesto vira da câmera até todos os dedos saírem', () => {
    const d = newPointerDrag()
    run(d, mouseDown({ pointerType: 'touch', coarse: true }), move(140))
    expect(stepPointerDrag(d, mouseDown({ pointerId: 2, pointerType: 'touch', isPrimary: false, othersDown: 1 }))).toEqual({ kind: 'pinch' })
    expect(d.phase).toBe('pinch')
    // nos dois dedos, nada gira
    expect(stepPointerDrag(d, move(200)).kind).toBe('none')
    expect(stepPointerDrag(d, move(10, 10, { pointerId: 2 })).kind).toBe('none')
    // um dedo sai e o outro fica: continua sendo pinça (nada de girar nem orbitar com um dedo)
    expect(stepPointerDrag(d, up(200, 100, { remaining: 1 })).kind).toBe('none')
    expect(stepPointerDrag(d, move(240, 100, { pointerId: 2 })).kind).toBe('none')
    // saiu o último: acaba (solta a trava)
    expect(stepPointerDrag(d, up(240, 100, { pointerId: 2, remaining: 0 }))).toEqual({ kind: 'end' })
    expect(d.phase).toBe('idle')
  })

  it('a pinça também acaba por blur ou cancelamento', () => {
    const d = newPointerDrag()
    run(d, mouseDown({ pointerType: 'touch' }), mouseDown({ pointerId: 2, pointerType: 'touch', isPrimary: false, othersDown: 1 }))
    expect(stepPointerDrag(d, { type: 'interrupt' })).toEqual({ kind: 'end' })
    expect(d.phase).toBe('idle')
  })

  it('terminado, não sobra nada do gesto anterior: o próximo aperto começa limpo', () => {
    const d = newPointerDrag()
    run(d, mouseDown(), move(300), up(300))
    expect(d.phase).toBe('idle')
    expect(run(d, mouseDown({ time: 1000 }), up(100, 100, { time: 1050 }))[1]).toEqual({ kind: 'release', tap: true })
  })
})

describe('clique no sol: toque de verdade ou fim de uma órbita da câmera', () => {
  it('a órbita que começa e termina no sol não é clique (andou demais ou demorou demais)', () => {
    expect(isTap(80, 300, false)).toBe(false)
    expect(isTap(0, TAP_MAX_MS + 200, false)).toBe(false)
  })

  it('um toque rápido no lugar é clique (no dedo, com a folga maior)', () => {
    expect(isTap(2, 120, false)).toBe(true)
    expect(isTap(MOUSE_TAP_SLOP + 2, 120, false)).toBe(false)
    expect(isTap(MOUSE_TAP_SLOP + 2, 120, true)).toBe(true)
  })
})
