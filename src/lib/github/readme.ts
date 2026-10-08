const BOILERPLATE = /^(table of contents|toc|contents|índice|indice|sumário|sumario)$/i

const BLOCK_TAGS = /<\/?(p|div|br|h[1-6]|li|ul|ol|table|tr|td|th|details|summary|section|header|center|blockquote|pre|hr)\b[^>]*>/gi

/** Resume um README em Markdown para texto simples curto (ou null se não sobrar nada útil). */
export function summarizeReadme(markdown: string, maxChars = 280, repoName?: string): string | null {
  let text = markdown.replace(/\r\n?/g, '\n')
  text = text.replace(/^﻿/, '').replace(/^---\n[\s\S]*?\n---[ \t]*(\n|$)/, '')
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  text = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?(\n\1[^\n]*(\n|$)|$)/gm, '\n')
  text = text.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, '\n')
  text = text.replace(BLOCK_TAGS, '\n').replace(/<[^>]+>/g, '')
  // Imagens e badges (inclusive dentro de links), em qualquer posição.
  text = text.replace(/\[\s*!\[[^\]]*\]\([^)]*\)\s*\]\([^)]*\)/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')

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
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/(\*\*|__)(.+?)\1/g, '$2')
        .replace(/(\*|_)(.+?)\1/g, '$2')
        .replace(/~~(.+?)~~/g, '$1')
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
