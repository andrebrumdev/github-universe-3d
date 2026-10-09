import { bloomLook, useBloom } from '@/store/bloom'
import { ATMOSPHERE_MATERIAL } from './geometries'

/** Único ponto que troca o visual com/sem bloom: a atmosfera (material compartilhado) muda aqui; órbitas e halo leem o store. */
export function applyBloomLook(active: boolean): void {
  ATMOSPHERE_MATERIAL.opacity = bloomLook(active).atmosphere
  useBloom.setState({ active })
}
