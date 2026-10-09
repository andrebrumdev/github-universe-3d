import * as THREE from 'three'
import { ATMOSPHERE_MATERIAL } from './geometries'

/**
 * Calor do periélio (ver `heatFactor`): a superfície ganha um tom quente de laranja a âmbar e a atmosfera sai do ciano
 * para um branco quente, mais forte. Os quadrados verdes não esquentam (o shader mascara o tom onde eles brilham).
 */
export const HEAT_COLOR_WARM = '#ff9a3c'
export const HEAT_COLOR_HOT = '#ffd27a'
/**
 * Brilho do tom quente no disco todo, com calor 1 (soma ao emissive, fora dos quadrados verdes): baixo, porque o sRGB
 * abre os valores lineares pequenos — o fundo escuro vira brasa (de #060a16 a ~#26201e), não bege.
 */
export const HEAT_BASE = 0.03
/**
 * Reforço na borda do disco (fresnel (1 − n·v)^3,5), com calor 1: o anel de fora brilha em âmbar e, só na beirada,
 * passa do limiar do bloom (luminância ~1,1 contra 0,8): no desktop o halo logo fora do disco sobe ~5% (medido no
 * close-up do universe-3d no periélio), sem lavar o planeta. Sem bloom, o calor se lê pelo anel e pelo tom.
 */
export const HEAT_RIM = 1.6
export const HEAT_RIM_POWER = 3.5
/** Tremor do calor: ±15% no tom, ruído lento que corre pela superfície. Zero sob movimento reduzido. */
export const HEAT_SHIMMER = 0.15

/** Atmosfera no calor máximo: branco quente, com a opacidade do visual atual × (1 + HEAT_ATMOSPHERE_BOOST). */
export const ATMOSPHERE_HOT = '#ffdcae'
export const HEAT_ATMOSPHERE_BOOST = 0.6

const WARM = new THREE.Color(HEAT_COLOR_WARM)
const HOT = new THREE.Color(HEAT_COLOR_HOT)
const ATMO_HOT = new THREE.Color(ATMOSPHERE_HOT)

/** Tom quente da superfície (linear, como o `mix` do shader) para um calor de 0 a 1; escreve em `out`. */
export function heatTint(heat: number, out: THREE.Color): THREE.Color {
  return out.lerpColors(WARM, HOT, heat)
}

/** Cópia da atmosfera compartilhada, uma por planeta (só ela pode mudar de cor com o calor). Descarte no cleanup. */
export function createAtmosphereMaterial(): THREE.MeshBasicMaterial {
  return ATMOSPHERE_MATERIAL.clone()
}

/**
 * Cor e opacidade da atmosfera de um planeta com este calor, por quadro e sem alocar. A base é o material
 * compartilhado, que o `applyBloomLook` ajusta: com ou sem bloom, a cópia segue o visual certo.
 */
export function applyAtmosphereHeat(material: THREE.MeshBasicMaterial, heat: number): void {
  material.color.lerpColors(ATMOSPHERE_MATERIAL.color, ATMO_HOT, heat)
  material.opacity = ATMOSPHERE_MATERIAL.opacity * (1 + HEAT_ATMOSPHERE_BOOST * heat)
}
