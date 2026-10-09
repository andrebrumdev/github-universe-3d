/**
 * Junta peças estáticas do mesmo material numa geometria só (um draw call em vez de um por peça). Cada peça entra com
 * a matriz que o R3F montaria com os <group>/<mesh> aninhados (`partMatrix`). Só posição e normal sobrevivem: os
 * materiais da nave são cor sólida com flatShading, sem textura.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type Vec3 = readonly [number, number, number]

export interface PartTransform {
  position?: Vec3
  /** Euler em rad, com a ordem opcional (padrão 'XYZ', como no R3F). */
  rotation?: readonly [number, number, number] | readonly [number, number, number, THREE.EulerOrder]
  quaternion?: THREE.Quaternion
}

/** Matriz de uma peça (posição, depois rotação ou quaternion), dentro do pai `parent` se houver. */
export function partMatrix({ position = [0, 0, 0], rotation, quaternion }: PartTransform, parent?: THREE.Matrix4): THREE.Matrix4 {
  const q = quaternion
    ? quaternion.clone()
    : new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation?.[0] ?? 0, rotation?.[1] ?? 0, rotation?.[2] ?? 0, rotation?.[3] ?? 'XYZ'))
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), q, new THREE.Vector3(1, 1, 1))
  return parent ? parent.clone().multiply(m) : m
}

export interface StaticPart {
  geometry: THREE.BufferGeometry
  matrix?: THREE.Matrix4
}

export function mergeParts(parts: readonly StaticPart[]): THREE.BufferGeometry {
  const pieces = parts.map(({ geometry, matrix }) => {
    // toNonIndexed já devolve uma cópia; a geometria de origem é compartilhada e não muda
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    if (!g.attributes.normal) g.computeVertexNormals()
    g.clearGroups()
    if (matrix) g.applyMatrix4(matrix)
    return g
  })
  const merged = mergeGeometries(pieces, false)
  for (const g of pieces) g.dispose()
  if (!merged) throw new Error('mergeParts: as peças não têm os mesmos atributos')
  return merged
}
