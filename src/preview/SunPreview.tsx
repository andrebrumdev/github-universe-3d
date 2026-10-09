import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { aberrationLimbPx, fringeRho, sunScreenRadius } from '@/lib/sun/aberration'
import { hasEyes, hasSparkle, pupilLook } from '@/lib/sun/face'
import { MAX_TURN_AWAY } from '@/lib/sun/gaze'
import { kickSquash, SQUASH_AT_REST, SQUASH_TARGET, squashScale, stepSquash, type Squash } from '@/lib/sun/squash'
import { SUN_EXPRESSIONS, type SunExpression, type SunMode } from '@/lib/sun/sunMachine'
import { SUN_RADIUS } from '@/lib/universe/orbits'
import { drawSunFace, SUN_TEX_H, SUN_TEX_W } from '@/components/three/sunFace'
import {
  createGlowGeometry,
  createGlowMaterial,
  createHazeGeometry,
  createHazeMaterial,
  createSunGeometry,
  createSunMaterial,
  createSunUniforms,
  SUN_UNIFORMS,
  sunGlowOpacity,
  sunHazeOpacity,
} from '@/components/three/sunMaterial'
import { BLOOM_LOOK } from '@/store/bloom'

const LABELS: Record<SunExpression, string> = {
  viajando: 'Viajando',
  serious: 'Sério',
  watching: 'De olho',
  happy: 'Feliz',
  surprised: 'Surpreso',
  sad: 'Triste',
  admiring: 'Admirando',
}

type Gaze = { label: string; yaw: number; pitch: number }
const GAZES: Gaze[] = [
  { label: 'Frente', yaw: 0, pitch: 0 },
  { label: 'Esquerda', yaw: -0.6, pitch: 0 },
  { label: 'Direita', yaw: 0.6, pitch: 0 },
  { label: 'Cima', yaw: 0, pitch: 0.45 },
  { label: 'Baixo', yaw: 0, pitch: -0.45 },
  // o limite de verdade do sol (MAX_TURN_AWAY)
  { label: `Lado extremo (${Math.round((MAX_TURN_AWAY * 180) / Math.PI)}°)`, yaw: MAX_TURN_AWAY, pitch: 0 },
]

/** Botões de squash & stretch: o modo que dá o empurrão e o alvo, e quanto tempo segura antes de voltar ao idle. */
const SQUASHES: { label: string; mode: SunMode; hold: number }[] = [
  { label: 'Puff', mode: 'hover', hold: 1.2 },
  { label: 'Bounce', mode: 'click', hold: 0.6 },
  { label: 'Sag', mode: 'away', hold: 2.5 },
]

type Kick = { mode: SunMode; hold: number; n: number }
type TileProps = { expression: SunExpression; blink: boolean; gaze: Gaze; reduced: boolean; kick: Kick | null }

/** Um sol de verdade (material, shader, brilho e névoa da cena) com a expressão forçada, sem a máquina de estados. */
function SunTile({ expression, blink, gaze, reduced, kick }: TileProps) {
  const face = useRef<THREE.Mesh>(null)
  const squashGroup = useRef<THREE.Group>(null)
  const squash = useRef<Squash>(SQUASH_AT_REST)
  const held = useRef<{ mode: SunMode; until: number }>({ mode: 'idle', until: 0 })
  const uniforms = useMemo(() => createSunUniforms(), [])
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = SUN_TEX_W
    canvas.height = SUN_TEX_H
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [])
  const closed = blink && hasEyes(expression)
  useEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext('2d')
    if (!ctx) return
    drawSunFace(ctx, expression, closed)
    // oxlint-disable-next-line react/immutability -- API imperativa de textura do Three.js
    texture.needsUpdate = true
  }, [expression, closed, texture])
  const parts = useMemo(() => {
    const glowMaterial = createGlowMaterial()
    glowMaterial.uniforms.uOpacity.value = sunGlowOpacity(BLOOM_LOOK.plain, 1)
    const hazeMaterial = createHazeMaterial()
    hazeMaterial.uniforms.uOpacity.value = sunHazeOpacity(BLOOM_LOOK.plain)
    return {
      geometry: createSunGeometry(),
      material: createSunMaterial(texture, uniforms),
      glowGeometry: createGlowGeometry(),
      glowMaterial,
      hazeGeometry: createHazeGeometry(),
      hazeMaterial,
    }
  }, [texture, uniforms])
  useEffect(
    () => () => {
      texture.dispose()
      for (const d of Object.values(parts)) d.dispose()
    },
    [texture, parts],
  )
  const pupil = useMemo<[number, number, number]>(() => [0, 0, 0], [])
  const scale = useMemo<[number, number, number]>(() => [1, 1, 1], [])
  const lastKick = useRef(0)

  useFrame(({ clock, camera, size, viewport }, dt) => {
    const t = clock.elapsedTime
    if (!reduced) SUN_UNIFORMS.uSunTime.value = t
    if (kick && kick.n !== lastKick.current) {
      lastKick.current = kick.n
      held.current = { mode: kick.mode, until: t + kick.hold }
      if (!reduced) squash.current = kickSquash(squash.current, kick.mode)
    }
    const mode = t < held.current.until ? held.current.mode : 'idle'
    squash.current = reduced ? SQUASH_AT_REST : stepSquash(squash.current, SQUASH_TARGET[mode], dt)
    squashGroup.current?.scale.fromArray(squashScale(squash.current, scale))
    face.current?.rotation.set(-gaze.pitch, gaze.yaw, 0, 'YXZ')
    // as pupilas de olho/admirando correm para a borda do lado para onde a cabeça virou
    pupilLook(expression, 0, 0, pupil, gaze.yaw, gaze.pitch)
    uniforms.uSunPupil.value.fromArray(pupil)
    // oxlint-disable-next-line react/immutability -- uniforms do Three.js são mutáveis por design
    uniforms.uSunBubble.value = expression === 'viajando' ? 1 : 0
    uniforms.uSunSparkle.value = hasSparkle(expression) ? 1 : 0
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180
    const radius = sunScreenRadius(SUN_RADIUS, camera.position.length(), fov, size.height * viewport.dpr)
    SUN_UNIFORMS.uSunAberration.value = aberrationLimbPx(radius)
    SUN_UNIFORMS.uSunFringe.value = fringeRho(SUN_UNIFORMS.uSunAberration.value, radius)
  })

  return (
    <group ref={squashGroup}>
      <mesh ref={face} geometry={parts.geometry} material={parts.material} />
      <mesh geometry={parts.glowGeometry} material={parts.glowMaterial} />
      <mesh geometry={parts.hazeGeometry} material={parts.hazeMaterial} />
    </group>
  )
}

/**
 * Galeria das expressões do sol (só no dev: `?preview=sun`): um sol de verdade por expressão — LED, borda âmbar,
 * pupilas do shader, bolinha de pensamento, aberração e brilho —, com piscar, direções do olhar, squash & stretch e
 * movimento reduzido. As fotos de referência do Sphere não entram (pesadas e de terceiros): ver o relatório.
 */
export function SunPreview() {
  const [blink, setBlink] = useState(false)
  const [gaze, setGaze] = useState<Gaze>(GAZES[0])
  const [reduced, setReduced] = useState(false)
  const [kick, setKick] = useState<Kick | null>(null)

  return (
    <main className="fixed inset-0 overflow-auto bg-space text-slate-100">
      <aside className="fixed left-4 top-4 z-10 w-64 space-y-4 rounded-2xl border border-neon/30 bg-panel/90 p-4 text-sm backdrop-blur">
        <h1 className="font-semibold text-neon">Sol — expressões</h1>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={blink} onChange={(e) => setBlink(e.target.checked)} />
          Piscar
        </label>

        <fieldset className="space-y-1">
          <legend className="text-xs uppercase tracking-wider text-slate-400">Olhar</legend>
          <div className="flex flex-wrap gap-1">
            {GAZES.map((g) => (
              <button
                key={g.label}
                type="button"
                onClick={() => setGaze(g)}
                className={`rounded-full border px-2 py-0.5 ${g === gaze ? 'border-neon text-neon' : 'border-slate-600 text-slate-300'}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-xs uppercase tracking-wider text-slate-400">Squash &amp; stretch</legend>
          <div className="flex gap-1">
            {SQUASHES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setKick((k) => ({ mode: s.mode, hold: s.hold, n: (k?.n ?? 0) + 1 }))}
                className="rounded-full border border-slate-600 px-2 py-0.5 text-slate-300 hover:border-neon hover:text-neon"
              >
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
          Movimento reduzido
        </label>

        <p className="text-xs text-slate-400">
          Comparar com referências: as fotos do Sphere ficam fora do repositório (pesadas e de terceiros). Abra-as em
          <code className="mx-1">.superpowers/sdd/…/sun-reference-sphere*.png</code>.
        </p>
      </aside>

      <section className="ml-72 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 p-4">
        {SUN_EXPRESSIONS.map((expression) => (
          <figure key={expression} className="overflow-hidden rounded-2xl border border-slate-700 bg-[#03050d]">
            <div className="aspect-square">
              <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 11.5], fov: 32 }}>
                <color attach="background" args={['#03050d']} />
                <ambientLight intensity={0.25} />
                <hemisphereLight args={['#9bd8ff', '#1a2350', 0.2]} />
                <SunTile expression={expression} blink={blink} gaze={gaze} reduced={reduced} kick={kick} />
              </Canvas>
            </div>
            <figcaption className="px-3 py-2 text-sm">
              {LABELS[expression]} <span className="text-slate-500">· {expression}</span>
            </figcaption>
          </figure>
        ))}
      </section>
    </main>
  )
}
