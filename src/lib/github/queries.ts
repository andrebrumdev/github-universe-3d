export const USER_QUERY = /* GraphQL */ `
  query Universe($login: String!) {
    user(login: $login) {
      id
      login
      name
      bio
      avatarUrl
      followers { totalCount }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: PUSHED_AT, direction: DESC }) {
        totalCount
        nodes {
          name
          description
          url
          stargazerCount
          forkCount
          pushedAt
          watchers { totalCount }
          primaryLanguage { name }
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: 1) { totalCount nodes { committedDate messageHeadline } }
              }
            }
          }
        }
      }
    }
  }
`

export const HISTORY_QUERY = /* GraphQL */ `
  query History($owner: String!, $name: String!, $authorId: ID!, $since: GitTimestamp!, $after: String) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: 100, after: $after, since: $since, author: { id: $authorId }) {
              pageInfo { hasNextPage endCursor }
              nodes { committedDate }
            }
          }
        }
      }
    }
  }
`

/** READMEs em lote: um alias por repo (`r0`, `r1`, ...), com o caminho do arquivo em `$path`. */
export function readmesQuery(count: number): string {
  const vars = Array.from({ length: count }, (_, i) => `$n${i}: String!`).join(', ')
  const fields = Array.from(
    { length: count },
    (_, i) => `r${i}: repository(owner: $owner, name: $n${i}) { object(expression: $path) { ... on Blob { text } } }`,
  ).join('\n  ')
  return `query Readmes($owner: String!, $path: String!, ${vars}) {\n  ${fields}\n}`
}
