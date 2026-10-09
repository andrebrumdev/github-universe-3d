import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { BurstShape, StarField } from 'three-low-poly'
import { STARFIELD_DEPTH } from '@/lib/cameraPoses'
import { generateParallaxStars } from '@/lib/universe/parallaxStars'

const PARALLAX_COUNT = 350
/** Estrelas da casca principal (um InstancedMesh). */
const STAR_COUNT = 3000
/**
 * Forma de cada estrela: a mesma estrela de 4 pontas do padrão da lib (BurstGeometry: pontas 0,6/1,9), mas plana e
 * com 3 segmentos por curva — 22 triângulos em vez de ~380 da extrusão com 12 segmentos (3000 estrelas: ~66 mil
 * triângulos em vez de ~1,14 milhão por quadro). Com poucos pixels de tamanho na tela, as duas saem iguais.
 */
const starGeometry = () => new THREE.ShapeGeometry(new BurstShape({ points: 4, innerRadius: 0.6, outerRadius: 1.9 }), 3)
/**
 * `radius` = max(260, 1,6 × distância máxima da câmera) e essa distância é ≥ 1,4 × (1,5 × alcance + 10), então o
 * alcance do sistema é no máximo radius / 3,36. Usado como limite superior seguro do alcance (a casca interna
 * começa a 1,3× dele), já que o Starfield só recebe `radius`.
 */
const REACH_FROM_RADIUS = 1 / 3.36
const PARALLAX_INNER = 1.3 * REACH_FROM_RADIUS
const PARALLAX_OUTER = 0.7

const VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(aSize * uScale / -mv.z, 1.5);
  gl_Position = projectionMatrix * mv;
}`
const FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.2, 1.0, d);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`

/**
 * Camada esparsa de estrelas fixas no mundo: a câmera se move entre elas e dá o paralaxe (a casca principal
 * acompanha a câmera, como um skybox). Pontos redondos e pequenos, abaixo do limiar do bloom.
 */
function ParallaxLayer({ radius }: { radius: number }) {
  const points = useMemo(() => {
    const data = generateParallaxStars({
      count: PARALLAX_COUNT,
      seed: 31,
      innerRadius: radius * PARALLAX_INNER,
      outerRadius: radius * PARALLAX_OUTER,
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(data.sizes, 1))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(data.colors, 3))
    const material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    const p = new THREE.Points(geometry, material)
    p.frustumCulled = false
    p.raycast = () => {}
    // diâmetro em px = tamanho × (altura do buffer em px / 2) / (tan(fov/2) × profundidade)
    const buffer = new THREE.Vector2()
    p.onBeforeRender = (renderer, _scene, camera) => {
      const fov = (camera as THREE.PerspectiveCamera).fov
      material.uniforms.uScale.value = renderer.getDrawingBufferSize(buffer).y / (2 * Math.tan((fov * Math.PI) / 360))
    }
    return p
  }, [radius])
  useEffect(
    () => () => {
      points.geometry.dispose()
      ;(points.material as THREE.Material).dispose()
    },
    [points],
  )
  return <primitive object={points} />
}

/**
 * Casca de estrelas de raio interno `radius` (ver `starfieldRadius`) e espessura STARFIELD_DEPTH, presa à câmera.
 * 'radial' funciona no WebGLRenderer. `sizeMin`/`sizeMax` são tamanhos angulares (rad a 1 unidade), multiplicados
 * pela distância de cada estrela: com a casca maior, as estrelas aparecem do mesmo tamanho na tela.
 * O plano far da câmera (CAMERA_FAR) cobre a borda externa no pior caso.
 * Mais uma camada esparsa de estrelas fixas no mundo (ParallaxLayer) para o paralaxe.
 */
export function Starfield({ radius }: { radius: number }) {
  const reducedMotion = useReducedMotion() ?? false
  const outer = radius + STARFIELD_DEPTH
  const field = useMemo(() => {
    const geometry = starGeometry()
    const f = new StarField({
      orientation: 'radial',
      count: STAR_COUNT,
      geometry,
      minRadius: radius,
      maxRadius: outer,
      seed: 7,
      sizeMin: 0.002,
      sizeMax: 0.007,
      // paleta padrão da lib (branco, azulado, creme) a ~80%: contra o fundo quase preto não compete com os planetas
      color: ['#cccccc', '#a2adcc', '#ccc3b3'],
      twinkle: !reducedMotion,
    })
    // a lib usa um clone da forma; a original pode ir embora
    geometry.dispose()
    return f
  }, [radius, outer, reducedMotion])
  useEffect(
    () => () => {
      // o dispose da lib solta a geometria e o material, mas não os buffers por instância (matriz e cor) do
      // InstancedMesh: sem o dispose dele, cada troca da casca (raio, movimento reduzido) os deixaria na GPU
      field.dispose()
      field.mesh.dispose()
    },
    [field],
  )
  useFrame(({ clock }) => {
    if (!reducedMotion) field.update(clock.elapsedTime)
  })
  return (
    <>
      <primitive object={field} />
      <ParallaxLayer radius={radius} />
    </>
  )
}
