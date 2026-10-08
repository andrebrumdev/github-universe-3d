import { describe, expect, it } from 'vitest'
import { abbreviate, languageBadge } from './languageIcons'

describe('languageBadge', () => {
  it('linguagem conhecida vira ícone com path não vazio', () => {
    for (const name of ['TypeScript', 'Go', 'Java', 'Shell', 'HTML', 'C++', 'Jupyter Notebook']) {
      const b = languageBadge(name)
      expect(b.kind, name).toBe('icon')
      if (b.kind === 'icon') expect(b.path.length).toBeGreaterThan(10)
    }
  })

  it('linguagem desconhecida vira texto', () => {
    expect(languageBadge('Hackish')).toEqual({ kind: 'text', text: 'Hc' })
    expect(languageBadge('Makefile')).toEqual({ kind: 'text', text: 'Mk' })
    expect(languageBadge('C#')).toEqual({ kind: 'text', text: 'C#' })
  })
})

describe('abbreviate', () => {
  it('só vogais cai na segunda letra', () => expect(abbreviate('Eau')).toBe('Ea'))
  it('uma letra fica como está', () => expect(abbreviate('C')).toBe('C'))
  it('palavra única: maiúscula + primeira consoante', () => expect(abbreviate('HASKELL')).toBe('Hs'))
  it('várias palavras: iniciais', () => {
    expect(abbreviate('Objective-C')).toBe('OC')
    expect(abbreviate('Emacs Lisp')).toBe('EL')
    expect(abbreviate('Vim Script Extra')).toBe('VS')
  })
  it('vazio vira ?', () => expect(abbreviate('')).toBe('?'))
})
