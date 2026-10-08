import { GITHUB_GRAPHQL_URL } from './config'

export class GitHubError extends Error {}

function rateLimitDetail(res: Response): string {
  const retryAfter = res.headers.get('retry-after')
  if (retryAfter) return `; tente de novo em ${retryAfter}s`
  const reset = Number(res.headers.get('x-ratelimit-reset'))
  if (reset > 0) return `; libera em ${new Date(reset * 1000).toISOString()}`
  return ''
}

export async function gql<T>(
  fetchImpl: typeof fetch,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetchImpl(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 403 || res.status === 429) {
    throw new GitHubError(`Limite de taxa do GitHub (${res.status})${rateLimitDetail(res)}`)
  }
  if (!res.ok) throw new GitHubError(`GitHub respondeu ${res.status}`)
  let json: { data?: T; errors?: { message: string }[] }
  try {
    json = (await res.json()) as typeof json
  } catch {
    throw new GitHubError('Resposta do GitHub não é JSON válido')
  }
  if (json.errors?.length) throw new GitHubError(json.errors.map((e) => e.message).join('; '))
  if (!json.data) throw new GitHubError('Resposta do GitHub sem dados')
  return json.data
}
