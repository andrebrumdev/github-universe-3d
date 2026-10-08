import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { ALL_PARTS, OctocatShip, type OctocatShipParts } from '@/components/three/octocat/OctocatShip'

const PART_LABELS: [keyof OctocatShipParts, string][] = [
  ['ship', 'Nave'],
  ['pilot', 'Octocat'],
  ['hat', 'Gorro-Clawd'],
]

export function OctocatPreview() {
  const [parts, setParts] = useState<OctocatShipParts>(ALL_PARTS)
  const [thruster, setThruster] = useState(0.3)
  const [spin, setSpin] = useState(true)

  return (
    <main className="fixed inset-0 bg-space text-slate-100">
      <Canvas dpr={[1, 2]} camera={{ position: [0, 1.4, 6.5], fov: 45 }}>
        <color attach="background" args={['#0a0e27']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <pointLight position={[-4, 2, 3]} intensity={20} color="#22d3ee" />
        <Stars radius={60} depth={30} count={1500} factor={3} fade />
        <OctocatShip thrusterLevel={thruster} parts={parts} />
        <OrbitControls target={[0, 0.9, 0]} autoRotate={spin} autoRotateSpeed={0.8} enablePan={false} minDistance={2.5} maxDistance={14} />
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
      </aside>
    </main>
  )
}
