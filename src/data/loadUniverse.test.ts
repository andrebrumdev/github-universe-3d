import { describe, expect, it } from 'vitest'
import { buildSampleUniverse } from '../lib/github/sample'
import { loadUniverse, UniverseLoadError } from './loadUniverse'

const respond = (body: string, status = 200) => (async () => new Response(body, { status })) as typeof fetch

describe('loadUniverse', () => {
  it('carrega o JSON publicado', async () => {
    const sample = buildSampleUniverse()
    let url = ''
    const impl = (async (input: RequestInfo | URL) => {
      url = String(input)
      return new Response(JSON.stringify(sample))
    }) as typeof fetch
    await expect(loadUniverse(impl, '/github-universe-3d/')).resolves.toEqual(sample)
    expect(url).toBe('/github-universe-3d/universe.json')
  })

  it('HTTP com erro vira UniverseLoadError', async () => {
    await expect(loadUniverse(respond('nope', 404), '/')).rejects.toThrow(UniverseLoadError)
  })

  it('schemaVersion diferente vira UniverseLoadError com mensagem clara', async () => {
    const old = JSON.stringify({ ...buildSampleUniverse(), schemaVersion: 0 })
    await expect(loadUniverse(respond(old), '/')).rejects.toThrow(/versão diferente/)
  })

  it('corpo que não é JSON vira UniverseLoadError', async () => {
    await expect(loadUniverse(respond('<html>'), '/')).rejects.toThrow(UniverseLoadError)
  })

  it('página HTML no lugar do JSON (fallback do servidor) conta como arquivo ausente', async () => {
    const impl = (async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch
    await expect(loadUniverse(impl, '/')).rejects.toThrow(/não encontrado/)
  })

  it.each(['null', '42', '"texto"'])('JSON que não é objeto (%s) vira UniverseLoadError', async (body) => {
    await expect(loadUniverse(respond(body), '/')).rejects.toThrow(UniverseLoadError)
  })
})
