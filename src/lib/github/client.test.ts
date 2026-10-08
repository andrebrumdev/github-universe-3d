import { describe, expect, it } from 'vitest'
import { GitHubError, gql } from './client'

const Q = 'query { viewer { login } }'

function fetchReturning(res: Response): typeof fetch {
  return (async () => res) as typeof fetch
}

describe('gql', () => {
  it('403 vira erro de limite de taxa com retry-after e sem o token', async () => {
    const res = new Response('{}', { status: 403, headers: { 'retry-after': '60' } })
    const err = await gql(fetchReturning(res), 'SECRET123', Q, {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubError)
    expect((err as Error).message).toMatch(/limite de taxa/i)
    expect((err as Error).message).toContain('60')
    expect((err as Error).message).not.toContain('SECRET123')
  })

  it('429 inclui x-ratelimit-reset como horário', async () => {
    const reset = String(Math.floor(new Date('2026-10-08T13:00:00Z').getTime() / 1000))
    const res = new Response('{}', { status: 429, headers: { 'x-ratelimit-reset': reset } })
    const err = await gql(fetchReturning(res), 't', Q, {}).catch((e: unknown) => e)
    expect((err as Error).message).toMatch(/limite de taxa/i)
    expect((err as Error).message).toContain('2026-10-08T13:00:00.000Z')
  })

  it('outros status continuam com a mensagem genérica', async () => {
    const res = new Response('{}', { status: 502 })
    await expect(gql(fetchReturning(res), 't', Q, {})).rejects.toThrow('GitHub respondeu 502')
  })

  it('junta todas as mensagens de errors', async () => {
    const body = { errors: [{ message: 'Primeiro erro' }, { message: 'Segundo erro' }] }
    const res = new Response(JSON.stringify(body), { status: 200 })
    const err = await gql(fetchReturning(res), 't', Q, {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubError)
    expect((err as Error).message).toContain('Primeiro erro')
    expect((err as Error).message).toContain('Segundo erro')
  })

  it('corpo que não é JSON vira GitHubError', async () => {
    const res = new Response('<html>proxy</html>', { status: 200 })
    const err = await gql(fetchReturning(res), 't', Q, {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubError)
  })
})
