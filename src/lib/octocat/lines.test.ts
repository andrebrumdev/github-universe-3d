import { describe, expect, it } from 'vitest'
import { firstName, formatLine, LINES, pickLine } from './lines'

describe('falas do Octocat', () => {
  it('toda fala tem texto', () => {
    for (const line of Object.values(LINES)) expect(line.text.length).toBeGreaterThan(0)
  })

  it('falas de primeira vez aparecem uma vez', () => {
    expect(pickLine('firstZoom', new Set())).not.toBeNull()
    expect(pickLine('firstZoom', new Set(['firstZoom']))).toBeNull()
    expect(pickLine('planet', new Set(['planet']))).not.toBeNull()
  })

  it('o estilingue gravitacional é anunciado uma vez só', () => {
    expect(pickLine('slingshot', new Set())?.text).toBe('Estilingue gravitacional!')
    expect(pickLine('slingshot', new Set(['slingshot']))).toBeNull()
  })

  it('a fala do sol fala do perfil, não do visitante', () => {
    expect(formatLine(LINES.sun.text, 'André Brum')).toBe('Esse é o perfil GitHub de André!')
  })

  it('primeiro nome', () => {
    expect(firstName('  Mona   Octocat ')).toBe('Mona')
    expect(firstName('')).toBe('')
  })
})
