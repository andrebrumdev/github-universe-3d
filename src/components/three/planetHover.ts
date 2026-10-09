import * as THREE from 'three'
import type { CellHover } from '@/lib/cellHover'
import { GRID_DAYS } from '@/lib/universe/activity'
import { CELL_GAP, cellAlpha, cellIndexFromUv, COL_PX, GRID_COLS, POLAR_CAP_PX, ROW_H, TEX_H, TEX_W } from './grid'

/**
 * O dia sob o ponteiro aceso no próprio planeta: uma camada do shader (planetGlow) por cima da textura, achada pelo
 * uv com a mesma grade de `grid.ts` (dois hemisférios 26×14 entre as calotas). A textura (cor + brilho no alfa,
 * pintada no worker) não muda: o realce é só emissivo, calculado do retângulo da célula.
 *
 * Uniforms por material (cada planeta acende o seu dia), no programa compartilhado (a chave de cache não muda):
 * - `uHoverCell`: coluna e linha da célula na textura (0–25, 0–13), -1 sem nenhuma;
 * - `uHoverTime`: tempo normalizado do acender, 0 → 1 em ~120 ms (a curva que desacelera fica no shader);
 * - `uHoverGlow`: o brilho do dia (`cellAlpha`), 0 no dia sem commits (só o contorno, apagado).
 */
export interface PlanetHoverUniforms {
  uHoverCell: { value: THREE.Vector2 }
  uHoverTime: { value: number }
  uHoverGlow: { value: number }
}

export function createHoverUniforms(): PlanetHoverUniforms {
  return { uHoverCell: { value: new THREE.Vector2(-1, -1) }, uHoverTime: { value: 0 }, uHoverGlow: { value: 0 } }
}

const HOVER_BY_MATERIAL = new WeakMap<THREE.Material, PlanetHoverUniforms>()

/** Cria e guarda os uniforms do hover deste material (feito uma vez, em createPlanetMaterial). */
export function attachHoverUniforms(material: THREE.Material): PlanetHoverUniforms {
  const uniforms = createHoverUniforms()
  HOVER_BY_MATERIAL.set(material, uniforms)
  return uniforms
}

/** Os uniforms do hover do material de um planeta. */
export function planetHoverUniforms(material: THREE.Material): PlanetHoverUniforms {
  const uniforms = HOVER_BY_MATERIAL.get(material)
  if (!uniforms) throw new Error('planetHover: material sem os uniforms do hover (use createPlanetMaterial)')
  return uniforms
}

/** Escreve o estado do hover nos uniforms do planeta, sem alocar. */
export function writeHoverUniforms(u: PlanetHoverUniforms, h: CellHover, weeks: number[][], max: number): void {
  if (h.lit < 0) {
    u.uHoverCell.value.set(-1, -1)
    u.uHoverTime.value = 0
    u.uHoverGlow.value = 0
    return
  }
  const week = Math.floor(h.lit / GRID_DAYS)
  const day = h.lit % GRID_DAYS
  // norte: semanas 0–25 nas linhas 0–6; sul: semanas 26–51 nas linhas 7–13 (ver grid.ts)
  const south = week >= GRID_COLS
  u.uHoverCell.value.set(south ? week - GRID_COLS : week, south ? GRID_DAYS + day : day)
  u.uHoverTime.value = h.level
  const count = weeks[week]?.[day] ?? 0
  u.uHoverGlow.value = count > 0 && max > 0 ? cellAlpha(count, max) : 0
}

/** Borda de cima da linha `r`, como o GLSL calcula (arredonda como o `rowTop` do desenho). */
function shaderRowTop(r: number): number {
  return POLAR_CAP_PX + Math.floor(r * ROW_H + 0.5)
}

/** Retângulo [x, y, w, h] (px da textura) que o shader acende para a coluna e linha de `uHoverCell`: o GLSL em JS. */
export function hoverRect(col: number, row: number): [number, number, number, number] {
  const half = CELL_GAP / 2
  const top = shaderRowTop(row)
  return [col * COL_PX + half, top + half, COL_PX - CELL_GAP, shaderRowTop(row + 1) - top - CELL_GAP]
}

const _inverse = new THREE.Matrix4()
const _ray = new THREE.Ray()
const _hit = new THREE.Vector3()
const UNIT_SPHERE = new THREE.Sphere(new THREE.Vector3(), 1)

/**
 * O dia sob o raio na superfície de `mesh` (esfera unitária escalada, a do planeta), ou -1. Direto na esfera, sem o
 * raycast do three (que aloca a cada acerto): leva o raio para o espaço da malha e acha o uv com a parametrização
 * da SphereGeometry. Use a matrixWorld já atualizada.
 */
export function cellOnSphere(ray: THREE.Ray, mesh: THREE.Object3D): number {
  _inverse.copy(mesh.matrixWorld).invert()
  _ray.copy(ray).applyMatrix4(_inverse)
  if (!_ray.intersectSphere(UNIT_SPHERE, _hit)) return -1
  _hit.normalize()
  // SphereGeometry: x = -cos φ sen θ, y = cos θ, z = sen φ sen θ; uv = (φ / 2π, 1 - θ / π)
  let u = Math.atan2(_hit.z, -_hit.x) / (2 * Math.PI)
  if (u < 0) u += 1
  const v = 1 - Math.acos(Math.min(1, Math.max(-1, _hit.y))) / Math.PI
  return cellIndexFromUv(u, v)
}

const f = (n: number) => n.toFixed(4)

/** Cores do realce (lineares, somadas ao emissivo): verde-hortelã no dia com commits, azul apagado no vazio. */
const ACTIVE_FILL = 'vec3( 0.03, 0.40, 0.18 )'
const ACTIVE_RIM = 'vec3( 0.70, 1.00, 0.84 ) * 1.4'
const EMPTY_FILL = 'vec3( 0.03, 0.05, 0.10 )'
const EMPTY_RIM = 'vec3( 0.40, 0.55, 0.85 ) * 0.7'

export const HOVER_GLSL_PARS = /* glsl */ `
uniform vec2 uHoverCell;
uniform float uHoverTime;
uniform float uHoverGlow;
float planetRowTop( float r ) { return ${f(POLAR_CAP_PX)} + floor( r * ${f(ROW_H)} + 0.5 ); }`

/**
 * Realce do dia: o retângulo da célula (o mesmo de `hoverRect`, com a volta da emenda u = 0/1) acende por dentro e
 * ganha um contorno fino e claro na borda, de largura mínima de ~1 px na tela (fwidth). Só emissivo: soma ao brilho.
 */
export const HOVER_GLSL_FRAGMENT = /* glsl */ `
	if ( uHoverCell.x >= 0.0 && uHoverTime > 0.0 ) {
		float hTop = planetRowTop( uHoverCell.y );
		vec2 hMin = vec2( uHoverCell.x * ${f(COL_PX)} + ${f(CELL_GAP / 2)}, hTop + ${f(CELL_GAP / 2)} );
		vec2 hMax = vec2( hMin.x + ${f(COL_PX - CELL_GAP)}, planetRowTop( uHoverCell.y + 1.0 ) - ${f(CELL_GAP / 2)} );
		vec2 hCenter = 0.5 * ( hMin + hMax );
		vec2 hPx = vec2( fract( vMapUv.x ) * ${f(TEX_W)}, ( 1.0 - vMapUv.y ) * ${f(TEX_H)} );
		hPx.x = hCenter.x + mod( hPx.x - hCenter.x + ${f(TEX_W / 2)}, ${f(TEX_W)} ) - ${f(TEX_W / 2)};
		vec2 hQ = abs( hPx - hCenter ) - 0.5 * ( hMax - hMin );
		float hDist = length( max( hQ, 0.0 ) ) + min( max( hQ.x, hQ.y ), 0.0 );
		float hAa = max( fwidth( hDist ), 1e-3 );
		float hFill = 1.0 - smoothstep( -hAa, 0.0, hDist );
		float hRimW = max( 1.0, 1.25 * hAa );
		float hRim = 1.0 - smoothstep( hRimW, hRimW + hAa, abs( hDist ) );
		float hOn = 1.0 - pow( 1.0 - clamp( uHoverTime, 0.0, 1.0 ), 3.0 );
		float hActive = step( 0.001, uHoverGlow );
		vec3 hFillColor = mix( ${EMPTY_FILL}, ${ACTIVE_FILL} * ( 0.4 + uHoverGlow ), hActive );
		vec3 hRimColor = mix( ${EMPTY_RIM}, ${ACTIVE_RIM}, hActive );
		totalEmissiveRadiance += hOn * ( hFill * hFillColor + hRim * hRimColor );
	}`
