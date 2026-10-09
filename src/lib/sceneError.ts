/**
 * O que fazer quando a cena 3D cai (o SceneBoundary no App pega o erro): a versão em lista quando não há WebGL
 * (spec §5 "Erros"), ou o aviso com "Tentar de novo" para o resto — o pedaço do 3D que não baixou, o contexto WebGL
 * perdido e qualquer erro no render.
 */
export type SceneFallback = 'list' | 'retry'

/** Lançado pela cena quando o navegador derruba o contexto WebGL (`webglcontextlost` no canvas). */
export class WebGLContextLostError extends Error {
  constructor() {
    super('O contexto WebGL foi perdido.')
    this.name = 'WebGLContextLostError'
  }
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '')

/** O WebGLRenderer do three lança isso quando o navegador não entrega um contexto (GPU bloqueada, limite de contextos). */
const WEBGL_CREATE = /error creating webgl context/i

/** import() dinâmico que falhou: Chrome, Firefox, Safari, e o ChunkLoadError de outros bundlers. */
const CHUNK_LOAD = /dynamically imported module|importing a module script failed/i

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'ChunkLoadError' || CHUNK_LOAD.test(error.message)
}

/** `webglAvailable`: a sondagem do WebGL refeita na hora do erro (ver `supportsWebGL`). */
export function sceneFallback(error: unknown, webglAvailable: boolean): SceneFallback {
  if (!webglAvailable || WEBGL_CREATE.test(messageOf(error))) return 'list'
  return 'retry'
}

/**
 * "Tentar de novo": remonta a cena (o canvas e o contexto WebGL nascem de novo). Se foi o pedaço do 3D que não
 * baixou, recarrega a página: o Chromium guarda o import() que falhou e nem pede o arquivo de novo (medido), e depois
 * de um deploy os nomes dos arquivos mudam e só o index novo os conhece.
 */
export function retryMode(error: unknown): 'remount' | 'reload' {
  return isChunkLoadError(error) ? 'reload' : 'remount'
}

export function sceneErrorMessage(error: unknown): string {
  if (isChunkLoadError(error)) return 'Não deu para baixar o universo 3D. Confira a conexão e tente de novo.'
  if (error instanceof WebGLContextLostError) return 'O navegador desligou o 3D (o contexto WebGL foi perdido).'
  return 'Algo deu errado ao desenhar o universo 3D.'
}
