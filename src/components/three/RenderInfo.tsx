import { useEffect, useRef } from 'react'
import { useFrame, useThree, type RootState } from '@react-three/fiber'

/** Quantos quadros somar antes de atualizar o painel (a média fica estável e o DOM não muda a cada quadro). */
const WINDOW = 30

declare global {
  interface Window {
    /**
     * `?perf`: médias por quadro do renderer.info (draw calls, triângulos), programas compilados e o que está na GPU
     * (geometrias e texturas vivas, do `renderer.info.memory`).
     */
    __renderInfo?: { calls: number; triangles: number; programs: number; geometries: number; textures: number }
    /** `?perf`: o estado do R3F (renderer, cena, câmera), para medir memória de fora da página. */
    __r3f?: () => RootState
  }
}

/**
 * `?perf`: draw calls e triângulos por quadro, do `renderer.info`, num cantinho da tela e em `window.__renderInfo`.
 * Zera o info no começo de cada quadro (prioridade negativa: roda antes de todos e não tira o render do R3F), então
 * conta também as passadas do EffectComposer, que chamam `render` várias vezes por quadro.
 */
export function RenderInfo() {
  const get = useThree((s) => s.get)
  const label = useRef<HTMLDivElement | null>(null)
  const acc = useRef({ frames: 0, calls: 0, triangles: 0 })
  useEffect(() => {
    const el = document.createElement('div')
    el.style.cssText = 'position:fixed;left:0;top:48px;z-index:60;padding:2px 6px;font:11px monospace;color:#0f0;background:#000c;pointer-events:none'
    document.body.appendChild(el)
    label.current = el
    const { info } = get().gl
    const autoReset = info.autoReset
    info.autoReset = false
    window.__r3f = get
    return () => {
      info.autoReset = autoReset
      el.remove()
      label.current = null
      delete window.__r3f
    }
  }, [get])
  useFrame(({ gl }) => {
    const a = acc.current
    a.frames++
    a.calls += gl.info.render.calls
    a.triangles += gl.info.render.triangles
    gl.info.reset()
    if (a.frames < WINDOW) return
    const info = {
      calls: Math.round(a.calls / a.frames),
      triangles: Math.round(a.triangles / a.frames),
      programs: gl.info.programs?.length ?? 0,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    }
    window.__renderInfo = info
    if (label.current) label.current.textContent = `draws ${info.calls} · tris ${info.triangles} · programs ${info.programs}`
    a.frames = a.calls = a.triangles = 0
  }, -1000)
  return null
}
