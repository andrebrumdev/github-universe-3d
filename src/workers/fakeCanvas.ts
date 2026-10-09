import type { MakeCanvas } from '@/components/three/texturePixels'

/**
 * Canvas falso para os testes no Node (sem canvas 2D): aceita qualquer desenho e o getImageData devolve bytes que
 * dependem do tamanho pedido e de quantas leituras já houve (dá para ver se a saída veio da pintura certa).
 */
export function fakeCanvas(): { make: MakeCanvas; reads: () => number } {
  let reads = 0
  const make: MakeCanvas = () => {
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(target, key: string) {
        if (key in target) return target[key]
        if (key === 'createLinearGradient') return () => ({ addColorStop: () => undefined })
        if (key === 'getImageData')
          return (_x: number, _y: number, w: number, h: number) => {
            reads++
            const data = new Uint8ClampedArray(w * h * 4)
            for (let i = 0; i < data.length; i++) data[i] = (i * 7 + reads * 13) & 255
            return { data }
          }
        return () => undefined
      },
      set(target, key: string, value) {
        target[key] = value
        return true
      },
    })
    return { getContext: () => ctx } as unknown as HTMLCanvasElement
  }
  return { make, reads: () => reads }
}
