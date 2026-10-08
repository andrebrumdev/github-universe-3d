import { SCHEMA_VERSION, type Universe } from '../lib/types'

export class UniverseLoadError extends Error {}

export async function loadUniverse(fetchImpl: typeof fetch = fetch, base: string = import.meta.env.BASE_URL): Promise<Universe> {
  const res = await fetchImpl(`${base}universe.json`, { cache: 'no-cache' })
  if (!res.ok) throw new UniverseLoadError(`Não foi possível carregar os dados (HTTP ${res.status}).`)
  // servidores com fallback de SPA (o dev server do Vite) devolvem o index.html quando o arquivo não existe
  if (res.headers.get('content-type')?.includes('text/html')) {
    throw new UniverseLoadError('Arquivo de dados não encontrado.')
  }
  let data: Partial<Universe> | null
  try {
    data = (await res.json()) as Partial<Universe> | null
  } catch {
    throw new UniverseLoadError('Os dados publicados estão corrompidos.')
  }
  if (typeof data !== 'object' || data === null) throw new UniverseLoadError('Os dados publicados estão corrompidos.')
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new UniverseLoadError('Os dados publicados são de uma versão diferente do site. Recarregue a página em instantes.')
  }
  return data as Universe
}
