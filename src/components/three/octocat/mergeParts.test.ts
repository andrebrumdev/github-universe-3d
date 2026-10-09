import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { mergeParts, partMatrix } from './mergeParts'

describe('partMatrix', () => {
  it('posição + rotação (com ordem) no referencial do pai, como os <group>/<mesh> aninhados do R3F', () => {
    const parent = partMatrix({ position: [1, 0, 0], rotation: [0, Math.PI / 2, 0] })
    const m = partMatrix({ position: [0, 0, 2] }, parent)
    const p = new THREE.Vector3().applyMatrix4(m)
    // filho em z=2 no pai girado 90° em y: vai para +x
    expect(p.x).toBeCloseTo(3)
    expect(p.z).toBeCloseTo(0)
  })
  it('quaternion vale no lugar da rotação', () => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    const p = new THREE.Vector3(1, 0, 0).applyMatrix4(partMatrix({ quaternion: q }))
    expect(p.y).toBeCloseTo(1)
  })
})

describe('mergeParts', () => {
  const box = new THREE.BoxGeometry(1, 1, 1) // indexada, com uv e grupos
  const shape = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)]))

  it('junta peças indexadas e não indexadas numa geometria só, com os triângulos de todas', () => {
    const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3
    const loose = shape.toNonIndexed()
    const merged = mergeParts([{ geometry: box }, { geometry: loose, matrix: partMatrix({ position: [5, 0, 0] }) }])
    expect(merged.attributes.position.count / 3).toBe(tris(box) + tris(loose))
    expect(Object.keys(merged.attributes).sort()).toEqual(['normal', 'position'])
    expect(merged.groups).toHaveLength(0)
  })

  it('cada peça vai para o lugar da sua matriz (a caixa da junção é a união das caixas)', () => {
    const merged = mergeParts([
      { geometry: box, matrix: partMatrix({ position: [-3, 0, 0] }) },
      { geometry: box, matrix: partMatrix({ position: [0, 4, 0], rotation: [0, 0, Math.PI / 4] }) },
    ])
    merged.computeBoundingBox()
    const b = merged.boundingBox!
    expect(b.min.x).toBeCloseTo(-3.5)
    expect(b.max.y).toBeCloseTo(4 + Math.SQRT1_2)
    expect(b.min.y).toBeCloseTo(-0.5)
  })

  it('não mexe nas geometrias de origem (são compartilhadas)', () => {
    const before = Array.from(box.attributes.position.array)
    mergeParts([{ geometry: box, matrix: partMatrix({ position: [9, 9, 9] }) }])
    expect(Array.from(box.attributes.position.array)).toEqual(before)
  })
})
