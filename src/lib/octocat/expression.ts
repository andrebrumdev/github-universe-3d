export const OCTOCAT_EXPRESSIONS = ['neutral', 'happy', 'wink', 'surprised', 'thinking', 'dizzy'] as const
export type OctocatExpression = (typeof OCTOCAT_EXPRESSIONS)[number]
