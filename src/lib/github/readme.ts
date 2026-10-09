const BOILERPLATE = /^(table of contents|toc|contents|índice|indice|sumário|sumario)$/i

const BLOCK_TAGS = /<\/?(p|div|br|h[1-6]|li|ul|ol|table|tr|td|th|details|summary|section|header|center|blockquote|pre|hr)\b[^<>]{0,500}>/gi

/** Resume um README em Markdown para texto simples curto (ou null se não sobrar nada útil). */
/** Entrada limitada antes de qualquer regex: o resumo só usa o começo do README. */
export const MAX_README_INPUT = 8192

/** Remove `<!-- ... -->` com varredura linear; comentário sem fim descarta o resto. */
function stripComments(text: string): string {
  let out = ''
  let i = 0
  for (;;) {
    const open = text.indexOf('<!--', i)
    if (open === -1) return out + text.slice(i)
    out += text.slice(i, open)
    const close = text.indexOf('-->', open + 4)
    if (close === -1) return out
    i = close + 3
  }
}

/** Remove cercas de código (``` ou ~~~) com uma passada por linhas; cerca aberta até o fim descarta o resto. */
function stripFences(text: string): string {
  const kept: string[] = []
  let fence: string | null = null
  for (const line of text.split('\n')) {
    const marker = /^ {0,3}(```|~~~)/.exec(line)?.[1] ?? null
    if (fence === null) {
      if (marker) fence = marker
      else kept.push(line)
    } else if (marker === fence) {
      fence = null
    }
  }
  return kept.join('\n')
}

/** Resume um README em Markdown para texto simples curto (ou null se não sobrar nada útil). */
export function summarizeReadme(markdown: string, maxChars = 280, repoName?: string): string | null {
  let text = markdown.slice(0, MAX_README_INPUT).replace(/\r\n?/g, '\n')
  text = text.replace(/^\uFEFF/, '').replace(/^---\n[\s\S]{0,2000}?\n---[ \t]*(\n|$)/, '')
  text = stripFences(stripComments(text))
  text = text.replace(/<h[1-6]\b[^<>]{0,500}>[^<]{0,500}<\/h[1-6]>/gi, '\n')
  text = text.replace(BLOCK_TAGS, '\n').replace(/<\/?[a-zA-Z][^<>]{0,500}>/g, '')
  // Imagens e badges (inclusive dentro de links), em qualquer posição.
  text = text
    .replace(/\[\s*!\[[^[\]]{0,200}\]\([^()]{0,500}\)\s*\]\([^()]{0,500}\)/g, '')
    .replace(/!\[[^[\]]{0,200}\]\([^()]{0,500}\)/g, '')

  const paragraphs: string[] = []
  let current: string[] = []
  const flush = () => {
    if (current.length) paragraphs.push(current.join(' '))
    current = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) flush()
    else if (/^(\t| {4})/.test(line) && current.length === 0) continue // código indentado
    else if (/^\s*#{1,6}(\s|$)/.test(line)) flush() // títulos (inclusive o título do README)
    else if (/^\s*\|/.test(line) || /^\s*[-*_]{3,}\s*$/.test(line) || /^\s*[=-]+\s*$/.test(line)) flush()
    else current.push(line.trim().replace(/^([-*+]|\d+\.)\s+/, '').replace(/^>\s?/, ''))
  }
  flush()

  const cleaned = paragraphs
    .map((p) =>
      p
        .replace(/\[([^[\]]{0,200})\]\([^()]{0,500}\)/g, '$1')
        .replace(/\[([^[\]]{0,200})\]\[[^[\]]{0,100}\]/g, '$1')
        .replace(/`([^`]{0,300})`/g, '$1')
        .replace(/(\*\*|__)(.{1,300}?)\1/g, '$2')
        .replace(/(\*|_)(.{1,300}?)\1/g, '$2')
        .replace(/~~(.{1,300}?)~~/g, '$1')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((p) => /[\p{L}\p{N}]/u.test(p))
    .filter((p) => !BOILERPLATE.test(p) && p.toLowerCase() !== repoName?.toLowerCase())

  const joined = cleaned.join(' ').trim()
  if (!joined) return null
  if (joined.length <= maxChars) return joined
  const budget = maxChars - 1
  let cut = joined.slice(0, budget)
  if (joined[budget] !== ' ') {
    const space = cut.lastIndexOf(' ')
    if (space > 0) cut = cut.slice(0, space)
  }
  return `${cut.trimEnd().replace(/[,;:.\-–—]+$/, '')}…`
}
