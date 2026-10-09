import { describe, expect, it } from 'vitest'
import { isChunkLoadError, retryMode, sceneErrorMessage, sceneFallback, WebGLContextLostError } from './sceneError'

const CHUNK_ERRORS = [
  new TypeError('Failed to fetch dynamically imported module: https://x.github.io/github-universe-3d/assets/Scene-abc.js'),
  new TypeError('error loading dynamically imported module: https://x/assets/Scene-abc.js'),
  new TypeError('Importing a module script failed.'),
  Object.assign(new Error('Loading chunk 3 failed.'), { name: 'ChunkLoadError' }),
]
const WEBGL_CREATE_ERRORS = [
  new Error('THREE.WebGLRenderer: Error creating WebGL context.'),
  new Error('THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.'),
]

describe('sceneFallback', () => {
  it('sem WebGL na hora do erro: a versão em lista, qualquer que seja o erro', () => {
    for (const error of [...CHUNK_ERRORS, new Error('x'), new WebGLContextLostError(), 'texto', null]) {
      expect(sceneFallback(error, false)).toBe('list')
    }
  })

  it('o renderer não conseguiu criar o contexto: lista, mesmo que a sondagem passe', () => {
    for (const error of WEBGL_CREATE_ERRORS) expect(sceneFallback(error, true)).toBe('list')
  })

  it('pedaço do 3D que não baixou, contexto perdido ou erro no render: aviso com "Tentar de novo"', () => {
    for (const error of [...CHUNK_ERRORS, new WebGLContextLostError(), new Error('boom'), new TypeError('x is undefined'), 'texto', undefined]) {
      expect(sceneFallback(error, true)).toBe('retry')
    }
  })
})

describe('isChunkLoadError', () => {
  it('reconhece as mensagens do Chrome, do Firefox e do Safari e o ChunkLoadError', () => {
    for (const error of CHUNK_ERRORS) expect(isChunkLoadError(error)).toBe(true)
  })
  it('não confunde com outros erros', () => {
    for (const error of [...WEBGL_CREATE_ERRORS, new WebGLContextLostError(), new Error('boom'), null, 'Failed']) {
      expect(isChunkLoadError(error)).toBe(false)
    }
  })
})

describe('retryMode', () => {
  it('pedaço do 3D que não baixou: recarrega a página (o navegador guarda o import que falhou; depois de um deploy, só o index novo conhece os nomes)', () => {
    for (const error of CHUNK_ERRORS) expect(retryMode(error)).toBe('reload')
  })
  it('contexto perdido ou erro no render: remonta a cena', () => {
    for (const error of [new WebGLContextLostError(), new Error('boom'), null]) expect(retryMode(error)).toBe('remount')
  })
})

describe('sceneErrorMessage', () => {
  it('uma mensagem para cada caso, em português', () => {
    expect(sceneErrorMessage(CHUNK_ERRORS[0])).toMatch(/baixar o universo 3D/)
    expect(sceneErrorMessage(new WebGLContextLostError())).toMatch(/desligou o 3D/)
    expect(sceneErrorMessage(new Error('boom'))).toMatch(/Algo deu errado/)
  })
})
