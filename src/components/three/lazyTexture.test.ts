import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { lazyDataTexture, LazyPixels } from './lazyTexture'

describe('LazyPixels: os pixels existem só na hora do upload', () => {
  it('gera ao ler, guarda até soltar e gera de novo depois (o three pode pedir outra vez)', () => {
    let builds = 0
    const pixels = new LazyPixels(2, 1, () => {
      builds++
      return new Uint8Array(8).fill(builds)
    })
    expect(builds).toBe(0)
    expect(pixels.data[0]).toBe(1)
    expect(pixels.data[0]).toBe(1)
    expect(builds).toBe(1)
    pixels.release()
    expect(builds).toBe(1)
    expect(pixels.data[0]).toBe(2)
    expect(builds).toBe(2)
  })
})

describe('lazyDataTexture', () => {
  it('textura RGBA de 8 bits com a imagem preguiçosa, pronta para subir', () => {
    const texture = lazyDataTexture(4, 2, () => new Uint8Array(32))
    expect(texture).toBeInstanceOf(THREE.DataTexture)
    expect(texture.image.width).toBe(4)
    expect(texture.image.height).toBe(2)
    expect(texture.format).toBe(THREE.RGBAFormat)
    expect(texture.type).toBe(THREE.UnsignedByteType)
    expect(texture.flipY).toBe(false)
    expect(texture.premultiplyAlpha).toBe(false)
    expect(texture.version).toBeGreaterThan(0)
  })

  it('depois do upload (onUpdate do three) solta os pixels; um upload novo os gera de novo', () => {
    let builds = 0
    const texture = lazyDataTexture(1, 1, () => {
      builds++
      return new Uint8Array(4)
    })
    const pixels = texture.image as unknown as LazyPixels
    expect(pixels.data).toHaveLength(4)
    texture.onUpdate?.(texture)
    expect(builds).toBe(1)
    expect(pixels.data).toHaveLength(4)
    expect(builds).toBe(2)
  })

  it('com `ready`, o primeiro upload espera os pixels (versão 0 até lá: o three usa a textura vazia)', async () => {
    let release!: () => void
    const ready = new Promise<void>((r) => (release = r))
    const texture = lazyDataTexture(1, 1, () => new Uint8Array(4), ready)
    expect(texture.version).toBe(0)
    release()
    await ready
    await Promise.resolve()
    expect(texture.version).toBeGreaterThan(0)
  })
})
