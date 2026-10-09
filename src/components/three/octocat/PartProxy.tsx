import { useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { MOUSE_HIT_PX, TOUCH_HIT_PX, worldPerPixel } from '@/lib/hitArea'
import type { ShipPart } from '@/lib/ship/focusGesture'

type Vec3 = [number, number, number]

interface PartProxyProps {
  part: ShipPart
  /** Raio no espaço do pai (a escala do mundo entra por cima). */
  radius: number
  position?: Vec3
}

/**
 * Área de toque invisível de uma peça pequena da nave (cabeça, Clawd, ponta de tentáculo, bocal) no modo de foco:
 * uma esfera que nunca fica menor que o alvo de toque na tela (44 px no dedo, 24 com mouse) na distância em que está.
 * Responde ao raycast com o ponto de entrada de verdade na esfera, então a ordem entre as peças é a do espaço.
 */
export function PartProxy({ part, radius, position }: PartProxyProps) {
  const mesh = useRef<THREE.Mesh>(null)
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  const height = useThree((s) => s.size.height)
  const raycast = useMemo(() => {
    const center = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const toCenter = new THREE.Vector3()
    const minPx = coarse ? TOUCH_HIT_PX : MOUSE_HIT_PX
    return (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const self = mesh.current
      const camera = raycaster.camera as THREE.PerspectiveCamera | undefined
      if (!self || !camera?.isPerspectiveCamera) return
      center.setFromMatrixPosition(self.matrixWorld)
      scale.setFromMatrixScale(self.matrixWorld)
      const { origin, direction } = raycaster.ray
      const along = toCenter.subVectors(center, origin).dot(direction)
      if (along <= 0) return
      const r = Math.max(radius * Math.max(scale.x, scale.y, scale.z), minPx * worldPerPixel(along, camera.fov, height))
      const perp2 = toCenter.lengthSq() - along * along
      if (perp2 > r * r) return
      const distance = Math.max(0, along - Math.sqrt(r * r - perp2))
      intersects.push({ distance, point: raycaster.ray.at(distance, new THREE.Vector3()), object: self })
    }
  }, [coarse, height, radius])
  return <mesh ref={mesh} position={position} visible={false} raycast={raycast} userData={{ part }} />
}
