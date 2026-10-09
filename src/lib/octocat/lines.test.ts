import { describe, expect, it } from 'vitest'
import { firstName, formatLine, LINES, PLAY_LINES, pickLine, pickPlayLine } from './lines'

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

  it('depois da trombada na tela, pede desculpas a cada trombada (são raras)', () => {
    expect(pickLine('crash', new Set())?.text).toBe('Opa, foi mal, vim rápido demais.')
    expect(pickLine('crash', new Set(['crash']))?.text).toBe('Opa, foi mal, vim rápido demais.')
  })

  it('a fala do sol fala do perfil, não do visitante', () => {
    expect(formatLine(LINES.sun.text, 'André Brum')).toBe('Esse é o perfil GitHub de André!')
  })

  it('primeiro nome', () => {
    expect(firstName('  Mona   Octocat ')).toBe('Mona')
    expect(firstName('')).toBe('')
  })

  it('falas da brincadeira: cada grupo tem mais de uma, curtas', () => {
    for (const group of Object.values(PLAY_LINES)) {
      expect(group.length).toBeGreaterThan(1)
      for (const text of group) expect(text.length).toBeLessThanOrEqual(40)
    }
    expect(PLAY_LINES.play).toContain('Ei! Isso faz cócegas!')
    expect(PLAY_LINES.play).toContain('Quer dar uma volta?')
    expect(PLAY_LINES.play).toContain('Gostou da minha nave?')
  })

  it('nunca repete a última fala do grupo', () => {
    for (const group of Object.keys(PLAY_LINES) as (keyof typeof PLAY_LINES)[]) {
      let last: string | null = null
      for (let i = 0; i < 200; i++) {
        // sorteio que tenta sempre a mesma posição: sem a regra, repetiria
        const text = pickPlayLine(group, last, () => 0.5)
        expect(text).not.toBe(last)
        expect(PLAY_LINES[group]).toContain(text)
        last = text
      }
    }
  })

  it('sem fala anterior, qualquer uma do grupo pode sair', () => {
    const seen = new Set(Array.from({ length: 50 }, (_, i) => pickPlayLine('play', null, () => i / 50)))
    expect(seen.size).toBe(PLAY_LINES.play.length)
  })
})
