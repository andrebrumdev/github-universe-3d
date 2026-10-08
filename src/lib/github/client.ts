import { GITHUB_GRAPHQL_URL } from './config'

export class GitHubError extends Error {}

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
  if (!res.ok) throw new GitHubError(`GitHub respondeu ${res.status}`)
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new GitHubError(json.errors[0].message)
  if (!json.data) throw new GitHubError('Resposta do GitHub sem dados')
  return json.data
}
