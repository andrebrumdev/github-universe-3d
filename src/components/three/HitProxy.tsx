import { useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { MOUSE_HIT_PX, proxyHit, TOUCH_HIT_PX } from '@/lib/hitArea'

interface HitProxyProps {
  /** Raio real do corpo (mundo). A área nunca fica menor que ele. */
  radius: number
  onClick: (e: ThreeEvent<MouseEvent>) => void
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void
  onPointerOut: () => void
  /** Opcional: aperto sobre o corpo (o sol usa para começar a girar). */
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void
}

/**
 * Área de toque invisível em volta de um corpo pequeno na tela (ver `lib/hitArea`): monte no grupo que fica no centro
 * do corpo. Não desenha nada; só responde ao raycast, sempre depois dos acertos reais.
 */
export function HitProxy({ radius, onClick, onPointerOver, onPointerOut, onPointerDown }: HitProxyProps) {
  const mesh = useRef<THREE.Mesh>(null)
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  const height = useThree((s) => s.size.height)
  const raycast = useMemo(() => {
    const center = new THREE.Vector3()
    const point = new THREE.Vector3()
    const minPx = coarse ? TOUCH_HIT_PX : MOUSE_HIT_PX
    return (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const self = mesh.current
      const camera = raycaster.camera as THREE.PerspectiveCamera | undefined
      if (!self || !camera?.isPerspectiveCamera) return
      center.setFromMatrixPosition(self.matrixWorld)
      const { origin, direction } = raycaster.ray
      const hit = proxyHit(origin, direction, center, radius, minPx, camera.fov, height)
      if (!hit) return
      intersects.push({ distance: hit.distance, point: raycaster.ray.at(hit.along, point).clone(), object: self })
    }
  }, [coarse, height, radius])
  return (
    <mesh
      ref={mesh}
      visible={false}
      raycast={raycast}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerDown={onPointerDown}
    />
  )
}
