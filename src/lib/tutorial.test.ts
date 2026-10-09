import { describe, expect, it } from 'vitest'
import { shouldAutostartTutorial, TUTORIAL_COPY, tutorialCopy, TUTORIAL_STEPS, tutorialCardVisible, tutorialFocusesPlanet, tutorialReducer } from './tutorial'

describe('tutorialReducer', () => {
  it('percorre os 4 passos e termina', () => {
    let step = tutorialReducer(null, 'start')
    const seen = [step]
    while (step) {
      step = tutorialReducer(step, 'next')
      seen.push(step)
    }
    expect(seen).toEqual(['welcome', 'repos', 'tech', 'free', null])
  })

  it('pular encerra de qualquer passo e start reinicia', () => {
    expect(tutorialReducer('repos', 'skip')).toBeNull()
    expect(tutorialReducer('tech', 'start')).toBe('welcome')
    expect(tutorialReducer(null, 'next')).toBeNull()
  })

  it('todo passo tem texto, e só "tech" foca um planeta', () => {
    for (const step of TUTORIAL_STEPS) expect(TUTORIAL_COPY[step].length).toBeGreaterThan(20)
    expect(TUTORIAL_STEPS.filter(tutorialFocusesPlanet)).toEqual(['tech'])
  })
})

describe('shouldAutostartTutorial', () => {
  const base = { done: false, presentationRequested: false, sceneReady: true }
  it('primeira visita com a cena já desenhada: abre', () => {
    expect(shouldAutostartTutorial(base)).toBe(true)
  })
  it('com a cena ainda carregando (rede lenta), espera: o sol do texto ainda não existe', () => {
    expect(shouldAutostartTutorial({ ...base, sceneReady: false })).toBe(false)
  })
  it('já visto, ou com a apresentação pedida no link: não abre sozinho', () => {
    expect(shouldAutostartTutorial({ ...base, done: true })).toBe(false)
    expect(shouldAutostartTutorial({ ...base, presentationRequested: true })).toBe(false)
  })
})

describe('tutorialCardVisible', () => {
  it('sem passo, nada; com um passo e nada selecionado, o cartão aparece', () => {
    expect(tutorialCardVisible(null, false)).toBe(false)
    for (const step of TUTORIAL_STEPS) expect(tutorialCardVisible(step, false)).toBe(true)
  })
  it('com um painel ou folha aberto, o cartão espera (o passo continua no store)', () => {
    expect(tutorialCardVisible('free', true)).toBe(false)
  })
})

describe('tutorialCopy', () => {
  it('com mouse, o texto de sempre', () => {
    for (const step of TUTORIAL_STEPS) expect(tutorialCopy(step, false)).toBe(TUTORIAL_COPY[step])
  })
  it('no toque, "toque" no lugar de "clique" e a pinça no lugar da rodinha', () => {
    expect(tutorialCopy('welcome', true)).toMatch(/toque nele/)
    expect(tutorialCopy('free', true)).toMatch(/pinça/)
    for (const step of TUTORIAL_STEPS) {
      expect(tutorialCopy(step, true)).not.toMatch(/clique|role para/)
      expect(tutorialCopy(step, true).length).toBeGreaterThan(20)
    }
  })
})
