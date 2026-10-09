import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { newZoomWatch, stepZoom, zoomClamp } from '@/lib/octocat/cues'
import { pickPlayLine } from '@/lib/octocat/lines'
import { cue } from '@/store/fourthWall'

/** O que o watcher lê do CameraControls (só leitura: nada aqui mexe na câmera nem na trava dela). */
interface ZoomReadable {
  enabled: boolean
  distance: number
  minDistance: number
  maxDistance: number
}

/** Pinça: mudança mínima (px) da distância entre os dedos para contar um passo. */
const PINCH_STEP = 6
/** Rodinha: deltas minúsculos (o fim do embalo do trackpad) não contam como sentido. */
const WHEEL_DEADBAND = 1

const isReadable = (c: unknown): c is ZoomReadable =>
  typeof c === 'object' && c !== null && 'distance' in c && 'minDistance' in c && 'maxDistance' in c

/**
 * Zoom demais (dentro da cena, montado pela nave): empurrar a rodinha ou a pinça contra o limite da câmera por ~1 s, ou
 * ir e voltar rápido, deixa o Octocat tonto (lib/octocat/cues). Ouve os eventos nativos do canvas sem `preventDefault`
 * nem captura e só lê a distância do CameraControls: não interfere nele nem na trava da câmera.
 */
export function useZoomDizzyCue(): void {
  const gl = useThree((s) => s.gl)
  const getThree = useThree((s) => s.get)
  useEffect(() => {
    const el = gl.domElement
    const watch = newZoomWatch()
    let lastLine: string | null = null
    const feed = (dir: -1 | 1, t: number) => {
      const controls = getThree().controls
      if (!isReadable(controls) || !controls.enabled) return
      if (!stepZoom(watch, t, dir, zoomClamp(controls.distance, controls.minDistance, controls.maxDistance))) return
      lastLine = pickPlayLine('dizzy', lastLine, Math.random)
      cue({ type: 'zoomDizzy', text: lastLine })
    }
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < WHEEL_DEADBAND) return
      // rodinha para baixo afasta (dolly out) no camera-controls; a pinça do trackpad chega como rodinha com ctrl
      feed(e.deltaY > 0 ? 1 : -1, e.timeStamp)
    }
    let spread = -1
    const fingers = (e: TouchEvent) => {
      if (e.touches.length !== 2) return -1
      const [a, b] = [e.touches[0], e.touches[1]]
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }
    const onTouchStart = (e: TouchEvent) => {
      spread = fingers(e)
    }
    const onTouchMove = (e: TouchEvent) => {
      const now = fingers(e)
      if (now < 0 || spread < 0) {
        spread = now
        return
      }
      if (Math.abs(now - spread) < PINCH_STEP) return
      // dedos abrindo aproximam
      feed(now > spread ? -1 : 1, e.timeStamp)
      spread = now
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [gl, getThree])
}
