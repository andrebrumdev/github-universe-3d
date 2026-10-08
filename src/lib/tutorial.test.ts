import { describe, expect, it } from 'vitest'
import { TUTORIAL_COPY, TUTORIAL_STEPS, tutorialFocusesPlanet, tutorialReducer } from './tutorial'

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
