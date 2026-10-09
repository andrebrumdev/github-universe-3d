import CameraControls from 'camera-controls'
import * as THREE from 'three'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { acquireCameraLock, bindCameraLock, releaseCameraLock, useCameraLock } from './cameraLock'

/**
 * A trava contra o CameraControls DE VERDADE (camera-controls, a versão que o drei usa), dirigido por eventos de
 * ponteiro num elemento falso (o ambiente dos testes é node: EventTarget com o mínimo de DOM que ele lê).
 */

/** O mínimo de DOMRect que o camera-controls cria (o node não tem). */
class FakeDOMRect {
  x: number
  y: number
  width: number
  height: number
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x
    this.y = y
    this.width = width
    this.height = height
  }
  get left() {
    return this.x
  }
  get top() {
    return this.y
  }
  get right() {
    return this.x + this.width
  }
  get bottom() {
    return this.y + this.height
  }
}

beforeAll(() => {
  vi.stubGlobal('DOMRect', FakeDOMRect)
  CameraControls.install({ THREE })
})

const SIZE = 400

class FakeDocument extends EventTarget {}

class FakeElement extends EventTarget {
  readonly style: Record<string, string> = {}
  readonly ownerDocument = new FakeDocument()
  getBoundingClientRect() {
    return { left: 0, top: 0, x: 0, y: 0, width: SIZE, height: SIZE, right: SIZE, bottom: SIZE, toJSON: () => ({}) }
  }
  setAttribute() {}
  removeAttribute() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() {
    return false
  }
}

/** Um evento de ponteiro de toque (o node não tem PointerEvent: um Event com os campos que o camera-controls lê). */
function touch(type: string, pointerId: number, x: number, y: number, isPrimary: boolean): Event {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId,
    pointerType: 'touch',
    isPrimary,
    clientX: x,
    clientY: y,
    movementX: 0,
    movementY: 0,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
  })
}

function setup() {
  const el = new FakeElement()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  camera.position.set(0, 0, 10)
  const controls = new CameraControls(camera, el as unknown as HTMLElement)
  // como no app: o efeito do modo de foco põe dois dedos para só aproximar
  controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY
  controls.smoothTime = 0
  controls.update(0)
  const unbind = bindCameraLock(controls, CameraControls.ACTION.NONE)
  return { el, controls, unbind }
}

/** Afasta os dois dedos (pinça abrindo) a partir de (cx, cy), quadro a quadro. */
function spread(el: FakeElement, controls: CameraControls) {
  const doc = el.ownerDocument
  for (let k = 1; k <= 6; k++) {
    doc.dispatchEvent(touch('pointermove', 1, 200 - 10 * k, 200, true))
    doc.dispatchEvent(touch('pointermove', 2, 240 + 10 * k, 200, false))
    controls.update(1 / 60)
  }
  for (let k = 0; k < 30; k++) controls.update(1 / 60)
}

beforeEach(() => useCameraLock.setState({ owner: null }))
afterEach(() => useCameraLock.setState({ owner: null }))

describe('pinça com a trava pega (CameraControls de verdade)', () => {
  it('o ouvinte do CameraControls registra o 1º dedo ANTES da trava: a pinça ainda aproxima, sem girar', () => {
    const { el, controls, unbind } = setup()
    const distance = controls.distance
    const azimuth = controls.azimuthAngle
    // a ordem ruim: o camera-controls vê o aperto primeiro, depois a nave pega a trava
    el.dispatchEvent(touch('pointerdown', 1, 200, 200, true))
    acquireCameraLock('ship')
    el.dispatchEvent(touch('pointerdown', 2, 240, 200, false))
    spread(el, controls)
    expect(controls.distance).toBeLessThan(distance - 0.5)
    expect(controls.azimuthAngle).toBeCloseTo(azimuth, 6)
    releaseCameraLock('ship')
    unbind()
  })

  it('a trava pega antes do ouvinte (a ordem de hoje): a pinça aproxima, sem girar', () => {
    const { el, controls, unbind } = setup()
    const distance = controls.distance
    const azimuth = controls.azimuthAngle
    acquireCameraLock('ship')
    el.dispatchEvent(touch('pointerdown', 1, 200, 200, true))
    el.dispatchEvent(touch('pointerdown', 2, 240, 200, false))
    spread(el, controls)
    expect(controls.distance).toBeLessThan(distance - 0.5)
    expect(controls.azimuthAngle).toBeCloseTo(azimuth, 6)
    releaseCameraLock('ship')
    unbind()
  })

  it('com a trava (pega antes ou depois do ouvinte), um dedo ou o botão esquerdo não giram a câmera; sem ela, giram', () => {
    for (const pointerType of ['touch', 'mouse']) {
      for (const lock of ['before', 'after', 'none'] as const) {
        const { el, controls, unbind } = setup()
        const azimuth = controls.azimuthAngle
        const at = (type: string, x: number) => Object.assign(touch(type, 1, x, 200, true), { pointerType, movementX: 20 })
        if (lock === 'before') acquireCameraLock('sun')
        el.dispatchEvent(at('pointerdown', 200))
        if (lock === 'after') acquireCameraLock('sun')
        for (let k = 1; k <= 6; k++) {
          el.ownerDocument.dispatchEvent(at('pointermove', 200 + 20 * k))
          controls.update(1 / 60)
        }
        for (let k = 0; k < 30; k++) controls.update(1 / 60)
        if (lock === 'none') expect(Math.abs(controls.azimuthAngle - azimuth)).toBeGreaterThan(0.05)
        else expect(controls.azimuthAngle).toBeCloseTo(azimuth, 6)
        releaseCameraLock('sun')
        unbind()
      }
    }
  })
})
