import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BLOOM_LOOK } from '@/store/bloom'
import { applyBloomLook } from './bloomLook'
import { ATMOSPHERE_MATERIAL } from './geometries'
import { applyAtmosphereHeat, createAtmosphereMaterial, HEAT_ATMOSPHERE_BOOST, HEAT_COLOR_HOT, HEAT_COLOR_WARM, heatTint } from './planetHeat'

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

describe('atmosfera aquecida (uma por planeta)', () => {
  it('cada planeta tem a sua cópia do material da atmosfera (mesmo visual de partida)', () => {
    const a = createAtmosphereMaterial()
    const b = createAtmosphereMaterial()
    expect(a).not.toBe(b)
    expect(a).not.toBe(ATMOSPHERE_MATERIAL)
    expect(a.color.equals(ATMOSPHERE_MATERIAL.color)).toBe(true)
    expect(a.blending).toBe(THREE.AdditiveBlending)
    expect(a.side).toBe(THREE.BackSide)
    a.dispose()
    b.dispose()
  })

  it('fria fica igual à compartilhada; quente, mais clara e quente (sai do ciano)', () => {
    const m = createAtmosphereMaterial()
    applyAtmosphereHeat(m, 0)
    expect(m.color.equals(ATMOSPHERE_MATERIAL.color)).toBe(true)
    expect(m.opacity).toBe(ATMOSPHERE_MATERIAL.opacity)
    applyAtmosphereHeat(m, 1)
    expect(m.opacity).toBeCloseTo(ATMOSPHERE_MATERIAL.opacity * (1 + HEAT_ATMOSPHERE_BOOST), 12)
    // ciano tem mais azul que vermelho; quente, o contrário
    expect(ATMOSPHERE_MATERIAL.color.b).toBeGreaterThan(ATMOSPHERE_MATERIAL.color.r)
    expect(m.color.r).toBeGreaterThan(m.color.b)
    expect(lum(m.color) * m.opacity).toBeGreaterThan(lum(ATMOSPHERE_MATERIAL.color) * ATMOSPHERE_MATERIAL.opacity)
    m.dispose()
  })

  it('segue o visual com/sem bloom (a opacidade base é a do material compartilhado)', () => {
    const m = createAtmosphereMaterial()
    applyBloomLook(true)
    applyAtmosphereHeat(m, 0.5)
    expect(m.opacity).toBeCloseTo(BLOOM_LOOK.bloom.atmosphere * (1 + 0.5 * HEAT_ATMOSPHERE_BOOST), 12)
    applyBloomLook(false)
    applyAtmosphereHeat(m, 0.5)
    expect(m.opacity).toBeCloseTo(BLOOM_LOOK.plain.atmosphere * (1 + 0.5 * HEAT_ATMOSPHERE_BOOST), 12)
    m.dispose()
  })

  it('não aloca por quadro: escreve na cor que o material já tem', () => {
    const m = createAtmosphereMaterial()
    const color = m.color
    applyAtmosphereHeat(m, 0.3)
    expect(m.color).toBe(color)
    m.dispose()
  })
})

describe('tom do calor na superfície', () => {
  it('de laranja (#ff9a3c) a âmbar (#ffd27a) conforme esquenta', () => {
    const out = new THREE.Color()
    expect(heatTint(0, out).equals(new THREE.Color(HEAT_COLOR_WARM))).toBe(true)
    expect(heatTint(1, out).equals(new THREE.Color(HEAT_COLOR_HOT))).toBe(true)
    expect(heatTint(1, out)).toBe(out)
    expect(HEAT_COLOR_WARM).toBe('#ff9a3c')
    expect(HEAT_COLOR_HOT).toBe('#ffd27a')
  })
})
