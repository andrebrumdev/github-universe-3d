import { beforeEach, describe, expect, it } from 'vitest'
import { acquireCameraLock, bindCameraLock, releaseCameraLock, useCameraLock, type LockableControls } from './cameraLock'

const NONE = 0
const ROTATE = 1
const DOLLY = 8
const TOUCH_ROTATE = 64
const TOUCH_DOLLY = 1024

/** O que o CameraControls tem de botões (a pinça de verdade está em cameraLock.real.test.ts). */
interface FakeControls extends LockableControls {
  mouseButtons: { left: number; middle: number; right: number; wheel: number }
  touches: { one: number; two: number; three: number }
}

function fakeControls(): FakeControls {
  return {
    mouseButtons: { left: ROTATE, middle: DOLLY, right: 2, wheel: DOLLY },
    touches: { one: TOUCH_ROTATE, two: TOUCH_DOLLY, three: 0 },
  }
}

beforeEach(() => useCameraLock.setState({ owner: null }))

describe('trava da câmera com dono', () => {
  it('quem pega primeiro é o dono; o outro não pega até ele soltar', () => {
    expect(acquireCameraLock('ship')).toBe(true)
    expect(acquireCameraLock('sun')).toBe(false)
    expect(useCameraLock.getState().owner).toBe('ship')
    // só o dono solta
    releaseCameraLock('sun')
    expect(useCameraLock.getState().owner).toBe('ship')
    releaseCameraLock('ship')
    expect(useCameraLock.getState().owner).toBeNull()
    expect(acquireCameraLock('sun')).toBe(true)
  })

  it('pegar de novo sendo o dono não muda nada', () => {
    expect(acquireCameraLock('sun')).toBe(true)
    expect(acquireCameraLock('sun')).toBe(true)
    expect(useCameraLock.getState().owner).toBe('sun')
  })
})

describe('trava aplicada no CameraControls na hora (sem esperar o React)', () => {
  it('pegar desliga só o giro de um ponteiro (botão esquerdo, um dedo), no mesmo instante', () => {
    const c = fakeControls()
    const unbind = bindCameraLock(c, NONE)
    acquireCameraLock('ship')
    // síncrono: já aplicado quando acquire volta
    expect(c.mouseButtons.left).toBe(NONE)
    expect(c.touches.one).toBe(NONE)
    // rodinha, botão do meio e dois dedos (pinça) continuam
    expect(c.mouseButtons.wheel).toBe(DOLLY)
    expect(c.mouseButtons.middle).toBe(DOLLY)
    expect(c.touches.two).toBe(TOUCH_DOLLY)
    unbind()
  })

  it('soltar (pelo dono) devolve o que estava antes; a tentativa de outro dono não mexe', () => {
    const c = fakeControls()
    const unbind = bindCameraLock(c, NONE)
    acquireCameraLock('sun')
    acquireCameraLock('ship')
    releaseCameraLock('ship')
    expect(c.mouseButtons.left).toBe(NONE)
    releaseCameraLock('sun')
    expect(c.mouseButtons.left).toBe(ROTATE)
    expect(c.touches.one).toBe(TOUCH_ROTATE)
    unbind()
  })

  it('ligar com a trava já pega aplica na hora; desligar devolve', () => {
    acquireCameraLock('ship')
    const c = fakeControls()
    const unbind = bindCameraLock(c, NONE)
    expect(c.mouseButtons.left).toBe(NONE)
    unbind()
    expect(c.mouseButtons.left).toBe(ROTATE)
    expect(c.touches.one).toBe(TOUCH_ROTATE)
  })

  it('o modo de foco mexendo nos outros botões durante a trava não é desfeito ao soltar', () => {
    const c = fakeControls()
    const unbind = bindCameraLock(c, NONE)
    acquireCameraLock('ship')
    c.mouseButtons.right = NONE
    c.touches.two = TOUCH_DOLLY
    releaseCameraLock('ship')
    expect(c.mouseButtons.right).toBe(NONE)
    expect(c.mouseButtons.left).toBe(ROTATE)
    unbind()
  })
})
