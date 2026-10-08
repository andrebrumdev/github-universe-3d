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
          readme: object(expression: "HEAD:README.md") { ... on Blob { text } }
          readmeLower: object(expression: "HEAD:readme.md") { ... on Blob { text } }
          readmePlain: object(expression: "HEAD:README") { ... on Blob { text } }
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
