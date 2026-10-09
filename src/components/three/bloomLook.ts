import { bloomLook, useBloom } from '@/store/bloom'
import { DUST_MATERIAL, ION_MATERIAL } from './cometLook'
import { ATMOSPHERE_MATERIAL } from './geometries'

/**
 * Único ponto que troca o visual com/sem bloom: a atmosfera e as caudas dos cometas (materiais compartilhados) mudam
 * aqui; órbitas, halo do sol e coma dos cometas leem o store.
 */
export function applyBloomLook(active: boolean): void {
  const look = bloomLook(active)
  ATMOSPHERE_MATERIAL.opacity = look.atmosphere
  ION_MATERIAL.opacity = look.ionTail
  DUST_MATERIAL.opacity = look.dustTail
  useBloom.setState({ active })
}
