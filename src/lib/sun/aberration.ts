/**
 * Aberração cromática só do sol: o vermelho e o azul se separam um pouco na direção radial da tela, mais no limbo.
 * A força no limbo cresce com o tamanho do sol na tela e trava num máximo (não estoura no close-up); o centro do
 * disco (o rosto) fica nítido. O shader repete `aberrationAt` com o mesmo expoente.
 */

/** Pixels de deslocamento no limbo por pixel de raio do sol na tela. */
export const ABERRATION_PER_RADIUS = 0.04
export const ABERRATION_MIN_PX = 0.5
export const ABERRATION_MAX_PX = 2.5
/** Queda do limbo para o centro: (1 − μ)^2, μ = cosseno entre a normal e a direção da câmera. */
export const ABERRATION_FALLOFF = 2

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Raio do sol na tela, em px do buffer: `viewportPx` é a altura do buffer, `fov` vertical em radianos. */
export function sunScreenRadius(radius: number, distance: number, fov: number, viewportPx: number): number {
  return ((viewportPx / 2) * radius) / (Math.max(distance, radius * 0.5) * Math.tan(fov / 2))
}

/** Deslocamento no limbo (px) para um sol com este raio na tela. */
export function aberrationLimbPx(screenRadiusPx: number): number {
  return clamp(ABERRATION_PER_RADIUS * screenRadiusPx, ABERRATION_MIN_PX, ABERRATION_MAX_PX)
}

/** Deslocamento (px) num ponto do disco com cosseno de visão `mu`: 0 no centro, `limbPx` no limbo. */
export function aberrationAt(mu: number, limbPx: number): number {
  return limbPx * (1 - clamp(mu, 0, 1)) ** ABERRATION_FALLOFF
}

/** O mesmo deslocamento em raios do sol, para separar as quedas do brilho e da névoa por canal. */
export function fringeRho(limbPx: number, screenRadiusPx: number): number {
  return limbPx / Math.max(screenRadiusPx, 25)
}
