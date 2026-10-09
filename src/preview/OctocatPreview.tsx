import { type ComponentRef, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { ALL_PARTS, type ArmMode, OctocatShip, type OctocatShipParts } from '@/components/three/octocat/OctocatShip'
import { OCTOCAT_EXPRESSIONS, type OctocatExpression } from '@/lib/octocat/expression'

const PART_LABELS: [keyof OctocatShipParts, string][] = [
  ['ship', 'Nave'],
  ['pilot', 'Octocat'],
  ['hat', 'Gorro-Clawd'],
]

type View = { label: string; position: [number, number, number]; target: [number, number, number] }

/** Pontos de vista para comparar com as referências (foto 3/4 traseira e desenho lateral). */
const VIEWS: View[] = [
  // foto: baixo, atrás e à esquerda — bocal perto, bolha à direita
  { label: 'Ângulo da referência', position: [-4.4, 1.2, -4.8], target: [0, 0.1, -0.4] },
  // desenho: de lado, frente à direita
  { label: 'Vista lateral', position: [-7, 0.3, -0.4], target: [0, 0.3, -0.4] },
]

const ARM_LABELS: [ArmMode, string][] = [
  ['rest', 'Parado'],
  ['wave', 'Acenar'],
  ['point', 'Apontar'],
]

const EXPRESSION_LABELS: Record<OctocatExpression, string> = {
  neutral: 'Neutro',
  happy: 'Feliz',
  wink: 'Piscadinha',
  surprised: 'Surpreso',
  thinking: 'Pensando',
}

export function OctocatPreview() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const [parts, setParts] = useState<OctocatShipParts>(ALL_PARTS)
  const [expression, setExpression] = useState<OctocatExpression>('neutral')
  const [thruster, setThruster] = useState(0.3)
  const [spin, setSpin] = useState(true)
  const [armMode, setArmMode] = useState<ArmMode>('wave')
  const [floating, setFloating] = useState(true)
  const [shake, setShake] = useState(0)

  const showView = ({ position, target }: View) => {
    const orbit = controls.current
    if (!orbit) return
    setSpin(false)
    orbit.object.position.set(...position)
    orbit.target.set(...target)
    orbit.update()
  }

  return (
    <main className="fixed inset-0 bg-space text-slate-100">
      <Canvas dpr={[1, 2]} camera={{ position: [5.5, 2.6, 4.5], fov: 45 }}>
        <color attach="background" args={['#0a0e27']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <pointLight position={[-4, 2, 3]} intensity={20} color="#22d3ee" />
        <Stars radius={60} depth={30} count={1500} factor={3} fade />
        <OctocatShip expression={expression} thrusterLevel={thruster} armMode={armMode} floating={floating} parts={parts} shake={shake} inertiaFrame="world" />
        <OrbitControls ref={controls} target={[0, 0.2, -0.4]} autoRotate={spin} autoRotateSpeed={0.8} enablePan={false} minDistance={2.5} maxDistance={14} />
      </Canvas>

      <aside className="fixed left-4 top-4 w-64 space-y-4 rounded-2xl border border-neon/30 bg-panel/90 p-4 text-sm backdrop-blur">
        <h1 className="font-semibold text-neon">Octocat 3D — preview</h1>

        <fieldset className="space-y-1">
          <legend className="text-xs uppercase tracking-wider text-slate-400">Peças</legend>
          {PART_LABELS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={parts[key]}
                onChange={(e) => setParts({ ...parts, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-xs uppercase tracking-wider text-slate-400">Expressão</legend>
          <div className="flex flex-wrap gap-1">
            {OCTOCAT_EXPRESSIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setExpression(e)}
                className={`rounded-full border px-2 py-0.5 ${e === expression ? 'border-neon text-neon' : 'border-slate-600 text-slate-300'}`}
              >
                {EXPRESSION_LABELS[e]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-xs uppercase tracking-wider text-slate-400">Braço</legend>
          <div className="flex gap-1">
            {ARM_LABELS.map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setArmMode(mode)}
                className={`rounded-full border px-2 py-0.5 ${mode === armMode ? 'border-neon text-neon' : 'border-slate-600 text-slate-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={floating} onChange={(e) => setFloating(e.target.checked)} />
          Flutuar
        </label>

        {/* tranco nos tentáculos e na antena, para ver a física de Verlet balançar e assentar */}
        <button
          type="button"
          onClick={() => setShake((n) => n + 1)}
          className="w-full rounded-lg border border-neon/40 px-3 py-1.5 text-neon hover:bg-neon/10"
        >
          Sacudir
        </button>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-slate-400">Propulsor</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={thruster}
            onChange={(e) => setThruster(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} />
          Girar sozinho
        </label>

        <div className="space-y-2">
          {VIEWS.map((view) => (
            <button
              key={view.label}
              type="button"
              onClick={() => showView(view)}
              className="w-full rounded-lg border border-neon/40 px-3 py-1.5 text-neon hover:bg-neon/10"
            >
              {view.label}
            </button>
          ))}
        </div>
      </aside>
    </main>
  )
}
