import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { newCellHover, pointCell, stepCellHover } from '@/lib/cellHover'
import { emptyWeeks, GRID_DAYS, GRID_WEEKS, maxCount } from '@/lib/universe/activity'
import { CELL_GAP, cellAlpha, cellFromUv, cellIndexFromUv, cellRect, TEX_H, TEX_W } from './grid'
import { createPlanetMaterial, GLOW_PROGRAM_KEY, patchGlowShader } from './planetGlow'
import { cellOnSphere, createHoverUniforms, hoverRect, planetHoverUniforms, writeHoverUniforms } from './planetHover'

/** uv do centro da célula desenhada para (semana, dia). */
function uvOf(week: number, day: number): [number, number] {
  const [x, y, w, h] = cellRect(week, day)
  return [(x + w / 2) / TEX_W, 1 - (y + h / 2) / TEX_H]
}

function sampleWeeks(): number[][] {
  const weeks = emptyWeeks()
  weeks[0][0] = 1
  weeks[10][3] = 4
  weeks[30][6] = 9
  weeks[51][6] = 2
  return weeks
}

/** Liga o dia `cell` no estado do hover, deixa acender e escreve os uniforms. */
function lightUp(cell: number, weeks: number[][]) {
  const h = newCellHover()
  pointCell(h, cell)
  stepCellHover(h, 1, false)
  const u = createHoverUniforms()
  writeHoverUniforms(u, h, weeks, maxCount(weeks))
  return u
}

describe('célula do uv sem alocar', () => {
  it('o índice semana × 7 + dia é o mesmo dia de cellFromUv, em cada pixel da textura', () => {
    for (let py = 0; py < TEX_H; py++) {
      for (let px = 0; px < TEX_W; px++) {
        const u = (px + 0.5) / TEX_W
        const v = 1 - (py + 0.5) / TEX_H
        const cell = cellFromUv(u, v)
        const idx = cellIndexFromUv(u, v)
        if (!cell) expect(idx).toBe(-1)
        else expect(idx).toBe(cell.week * GRID_DAYS + cell.day)
      }
    }
  })
})

describe('uniforms do dia aceso (uHoverCell, uHoverTime)', () => {
  it('as 364 células: o retângulo que o shader acende é o desenhado para o dia de cellFromUv', () => {
    const weeks = sampleWeeks()
    for (let week = 0; week < GRID_WEEKS; week++) {
      for (let day = 0; day < GRID_DAYS; day++) {
        const [u, v] = uvOf(week, day)
        const cell = cellFromUv(u, v)
        expect(cell).toEqual({ week, day })
        const uniforms = lightUp(cellIndexFromUv(u, v), weeks)
        const { x, y } = uniforms.uHoverCell.value
        expect(hoverRect(x, y)).toEqual(cellRect(week, day))
        expect(uniforms.uHoverTime.value).toBe(1)
      }
    }
  })

  it('cada pixel de uma célula (folga incluída) cai no retângulo aceso dela, com a folga em volta', () => {
    const weeks = emptyWeeks()
    const half = CELL_GAP / 2
    for (let py = 0; py < TEX_H; py += 3) {
      for (let px = 0; px < TEX_W; px += 3) {
        const u = (px + 0.5) / TEX_W
        const v = 1 - (py + 0.5) / TEX_H
        const idx = cellIndexFromUv(u, v)
        if (idx < 0) continue
        const { x, y } = lightUp(idx, weeks).uHoverCell.value
        const [rx, ry, rw, rh] = hoverRect(x, y)
        expect(px + 0.5).toBeGreaterThanOrEqual(rx - half)
        expect(px + 0.5).toBeLessThanOrEqual(rx + rw + half)
        expect(py + 0.5).toBeGreaterThanOrEqual(ry - half)
        expect(py + 0.5).toBeLessThanOrEqual(ry + rh + half)
      }
    }
  })

  it('dia com commits brilha na força dele; dia vazio só contorna (brilho 0)', () => {
    const weeks = sampleWeeks()
    const max = maxCount(weeks)
    expect(lightUp(30 * GRID_DAYS + 6, weeks).uHoverGlow.value).toBe(cellAlpha(9, max))
    expect(lightUp(10 * GRID_DAYS + 3, weeks).uHoverGlow.value).toBe(cellAlpha(4, max))
    expect(lightUp(10 * GRID_DAYS + 4, weeks).uHoverGlow.value).toBe(0)
  })

  it('sem dia aceso: célula -1 e tempo 0; ao apagar, a mesma célula com o tempo descendo', () => {
    const weeks = sampleWeeks()
    const u = createHoverUniforms()
    const h = newCellHover()
    writeHoverUniforms(u, h, weeks, maxCount(weeks))
    expect(u.uHoverCell.value.toArray()).toEqual([-1, -1])
    expect(u.uHoverTime.value).toBe(0)
    pointCell(h, 3)
    stepCellHover(h, 1, false)
    pointCell(h, -1)
    stepCellHover(h, 0.06, false)
    writeHoverUniforms(u, h, weeks, maxCount(weeks))
    expect(u.uHoverCell.value.toArray()).toEqual([0, 3])
    expect(u.uHoverTime.value).toBeCloseTo(0.5)
  })

  it('escrever os uniforms não aloca: o mesmo Vector2', () => {
    const u = createHoverUniforms()
    const before = u.uHoverCell.value
    const h = newCellHover()
    pointCell(h, 200)
    writeHoverUniforms(u, h, emptyWeeks(), 0)
    expect(u.uHoverCell.value).toBe(before)
  })
})

describe('dia sob o raio, direto na esfera (sem o raycast do three)', () => {
  it('bate com o uv do raycast da malha nos centros das 364 células, com o planeta girado e inclinado', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial())
    const parent = new THREE.Group()
    parent.position.set(3, -2, 5)
    parent.rotation.set(0, 0, 0.4)
    parent.add(mesh)
    mesh.scale.setScalar(1.7)
    mesh.rotation.y = 2.1
    parent.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    const local = new THREE.Vector3()
    const center = new THREE.Vector3()
    mesh.getWorldPosition(center)
    let checked = 0
    for (let week = 0; week < GRID_WEEKS; week++) {
      for (let day = 0; day < GRID_DAYS; day++) {
        const [u, v] = uvOf(week, day)
        // ponto da esfera unitária com esse uv (a parametrização da SphereGeometry)
        const phi = u * Math.PI * 2
        const theta = (1 - v) * Math.PI
        local.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta))
        const world = mesh.localToWorld(local.clone())
        const origin = world.clone().add(world.clone().sub(center).normalize().multiplyScalar(10))
        raycaster.set(origin, world.clone().sub(origin).normalize())
        const hit = raycaster.intersectObject(mesh)[0]
        expect(hit?.uv).toBeDefined()
        const expected = cellIndexFromUv(hit.uv!.x, hit.uv!.y)
        expect(expected).toBe(week * GRID_DAYS + day)
        expect(cellOnSphere(raycaster.ray, mesh)).toBe(expected)
        checked++
      }
    }
    expect(checked).toBe(364)
  })

  it('raio que não pega o planeta: nenhum dia', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32))
    mesh.updateMatrixWorld(true)
    const ray = new THREE.Ray(new THREE.Vector3(5, 5, 5), new THREE.Vector3(1, 0, 0))
    expect(cellOnSphere(ray, mesh)).toBe(-1)
  })
})

describe('uniforms por planeta no shader compartilhado', () => {
  function standardShader() {
    return { uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms), fragmentShader: THREE.ShaderLib.standard.fragmentShader }
  }

  it('o shader declara e usa uHoverCell e uHoverTime, com o mesmo retângulo de hoverRect', () => {
    const shader = standardShader()
    patchGlowShader(shader, createHoverUniforms())
    const frag = shader.fragmentShader
    expect(frag).toContain('uniform vec2 uHoverCell;')
    expect(frag).toContain('uniform float uHoverTime;')
    expect(frag).toContain('uniform float uHoverGlow;')
    expect(frag).toContain('planetRowTop( uHoverCell.y )')
    expect(frag).toContain('fwidth')
  })

  it('cada material tem os seus uniforms, e a chave do programa é a mesma para todos', () => {
    const a = createPlanetMaterial(new THREE.Texture())
    const b = createPlanetMaterial(new THREE.Texture())
    expect(a.customProgramCacheKey()).toBe(GLOW_PROGRAM_KEY)
    expect(b.customProgramCacheKey()).toBe(GLOW_PROGRAM_KEY)
    const ua = planetHoverUniforms(a)
    const ub = planetHoverUniforms(b)
    expect(ua).not.toBe(ub)
    const sa = standardShader()
    const sb = standardShader()
    a.onBeforeCompile(sa as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer)
    b.onBeforeCompile(sb as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer)
    expect(sa.uniforms.uHoverCell).toBe(ua.uHoverCell)
    expect(sb.uniforms.uHoverCell).toBe(ub.uHoverCell)
    expect(sa.uniforms.uHoverTime).toBe(ua.uHoverTime)
    // o mesmo texto de shader: um programa só na GPU
    expect(sa.fragmentShader).toBe(sb.fragmentShader)
  })
})
