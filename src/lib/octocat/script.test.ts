import { describe, expect, it } from 'vitest'
import type { RepoBase } from '../types'
import { LINES } from './lines'
import {
  direct,
  favoriteRepo,
  hasLateNightCommit,
  isNotesRepo,
  localHour,
  MIN_GAP_MS,
  newScriptState,
  noteLine,
  PROFILE_TIME_ZONE,
  recruiterFromReferrer,
  recruiterFromUrl,
  recruiterLine,
  repoLineKind,
  repoLineText,
  SCRIPT_LINES,
  SHRINK_COOLDOWN_MS,
  ZOOM_DIZZY_COOLDOWN_MS,
  type Cue,
  type RepoLike,
  type ScriptContext,
  type ScriptState,
} from './script'

const repo = (over: Partial<RepoBase> & { name: string }): RepoLike => ({
  description: '',
  stars: 3,
  totalCommits: 20,
  languages: [{ name: 'TypeScript', color: '#3178c6', bytes: 100 }],
  readme: 'Um projeto.',
  ...over,
})

const free = (now: number, over: Partial<ScriptContext> = {}): ScriptContext => ({
  now,
  busy: false,
  bubble: false,
  parked: true,
  reduced: false,
  panelKey: null,
  ...over,
})

/** Estado com a última fala há muito tempo (nada segura a próxima). */
const fresh = (): ScriptState => newScriptState()

describe('roteiro: recrutador', () => {
  it('reconhece o link de recrutador (?ref=recrutador, ?ref=recruiter, ?recrutador)', () => {
    expect(recruiterFromUrl('?ref=recrutador')).toBe(true)
    expect(recruiterFromUrl('?ref=Recruiter&x=1')).toBe(true)
    expect(recruiterFromUrl('?nobloom&recrutador')).toBe(true)
    expect(recruiterFromUrl('?recrutador=1')).toBe(true)
    expect(recruiterFromUrl('?ref=github')).toBe(false)
    expect(recruiterFromUrl('')).toBe(false)
  })

  it('reconhece quem chega do LinkedIn ou de sites de vaga', () => {
    for (const ref of [
      'https://www.linkedin.com/in/fulano/',
      'https://linkedin.com/feed',
      'https://lnkd.in/abc',
      'https://empresa.gupy.io/jobs/123',
      'https://boards.greenhouse.io/acme',
      'https://jobs.lever.co/acme',
      'https://apply.workable.com/acme/',
    ]) {
      expect(recruiterFromReferrer(ref), ref).toBe(true)
    }
    for (const ref of ['', 'https://github.com/andre', 'https://notlinkedin.com/', 'https://linkedin.com.evil.io/', 'lixo']) {
      expect(recruiterFromReferrer(ref), ref).toBe(false)
    }
  })

  it('hora local no fuso do dono do perfil (padrão America/Sao_Paulo)', () => {
    expect(PROFILE_TIME_ZONE).toBe('America/Sao_Paulo')
    expect(localHour('2026-07-02T06:12:00Z', PROFILE_TIME_ZONE)).toBe(3)
    expect(localHour('2026-07-02T02:30:00Z', PROFILE_TIME_ZONE)).toBe(23)
    expect(localHour('2026-07-02T06:12:00Z', 'UTC')).toBe(6)
    // só data, ou lixo: sem hora
    expect(localHour('2026-07-02', PROFILE_TIME_ZONE)).toBeNull()
    expect(localHour('ontem', PROFILE_TIME_ZONE)).toBeNull()
  })

  it('madrugada é de 00:00 a 04:59 no fuso; sem nenhuma hora, não dá para saber (null)', () => {
    expect(hasLateNightCommit(['2026-07-02T15:00:00Z', '2026-07-02T06:12:00Z'])).toBe(true)
    expect(hasLateNightCommit(['2026-07-02T03:00:00Z'])).toBe(true) // 00:00 em São Paulo
    expect(hasLateNightCommit(['2026-07-02T08:00:00Z'])).toBe(false) // 05:00 em São Paulo: já é manhã
    expect(hasLateNightCommit(['2026-07-02T12:00:00Z', '2026-07-02T21:00:00Z'])).toBe(false)
    expect(hasLateNightCommit([])).toBeNull()
    expect(hasLateNightCommit(['2026-07-02'])).toBeNull()
  })

  it('a piada do "commit das 3 da manhã" só sai quando é verdade (ou quando não há hora para conferir)', () => {
    const night = { profile: { lastCommit: null }, repos: [{ lastCommit: { date: '2026-07-02T06:12:00Z', message: 'x' } }] }
    const day = { profile: { lastCommit: { date: '2026-07-02T15:00:00Z', message: 'y' } }, repos: [{ lastCommit: { date: '2026-07-01T14:00:00Z', message: 'x' } }] }
    const unknown = { profile: { lastCommit: null }, repos: [{ lastCommit: null }] }
    expect(recruiterLine(night)).toBe('Psiu, você é recrutador? Finge que não viu o commit das 3 da manhã.')
    expect(recruiterLine(day)).toBe('Psiu, você é recrutador? Pode olhar à vontade, tá tudo commitado.')
    expect(recruiterLine(unknown)).toBe(SCRIPT_LINES.recruiterNight)
    // o fuso manda: 06:12 UTC não é madrugada em UTC
    expect(recruiterLine(night, 'UTC')).toBe(SCRIPT_LINES.recruiterClean)
  })

  it('espera o tutorial, a apresentação, o balão e o intervalo; depois fala uma vez e pede para lembrar o visitante', () => {
    const s = fresh()
    const cue: Cue = { type: 'recruiter', text: SCRIPT_LINES.recruiterNight }
    expect(direct(s, cue, free(1000, { busy: true }))).toBeNull()
    expect(direct(s, { type: 'tick' }, free(2000, { bubble: true }))).toBeNull()
    noteLine(s, 3000)
    expect(direct(s, { type: 'tick' }, free(3000 + MIN_GAP_MS - 1))).toBeNull()
    const d = direct(s, { type: 'tick' }, free(3000 + MIN_GAP_MS))
    expect(d?.line).toEqual({ text: SCRIPT_LINES.recruiterNight, expression: 'wink' })
    expect(d?.remember).toBe('recruiter')
    // nunca de novo nesta visita
    expect(direct(s, cue, free(100_000))).toBeNull()
    expect(direct(s, { type: 'tick' }, free(200_000))).toBeNull()
  })
})

describe('roteiro: repos ao abrir o painel', () => {
  it('favorito: o primeiro fixado que virou planeta; sem fixados, o de mais stars', () => {
    const repos = [repo({ name: 'a', stars: 10 }), repo({ name: 'b', stars: 50 }), repo({ name: 'c', stars: 1 })]
    expect(favoriteRepo({ profile: { pinned: ['fora', 'c', 'a'] }, repos })).toBe('c')
    expect(favoriteRepo({ profile: {}, repos })).toBe('b')
    expect(favoriteRepo({ profile: { pinned: [] }, repos })).toBe('b')
    expect(favoriteRepo({ profile: { pinned: ['fora'] }, repos })).toBe('b')
    // ninguém com star: sem favorito
    expect(favoriteRepo({ profile: {}, repos: [repo({ name: 'z', stars: 0 })] })).toBeNull()
  })

  it('caderno de ideias: nome, descrição ou tópicos (sem diferenciar maiúsculas)', () => {
    for (const r of [
      repo({ name: 'notes' }),
      repo({ name: 'my-Notes' }),
      repo({ name: 'myNotes' }),
      repo({ name: 'notas' }),
      repo({ name: 'ideias' }),
      repo({ name: 'ideia' }),
      repo({ name: 'ideas' }),
      repo({ name: 'TIL' }),
      repo({ name: 'journal' }),
      repo({ name: 'zettelkasten' }),
      repo({ name: 'caderno' }),
      repo({ name: 'second-brain' }),
      repo({ name: 'x', description: 'Meu caderno de estudos' }),
      repo({ name: 'x', description: 'A daily JOURNAL' }),
      repo({ name: 'x', topics: ['second-brain'] }),
      repo({ name: 'x', topics: ['til'] }),
    ]) {
      expect(isNotesRepo(r), `${r.name} ${r.description} ${r.topics}`).toBe(true)
    }
    for (const r of [
      repo({ name: 'utils' }),
      repo({ name: 'until-then' }),
      repo({ name: 'notebook-api' }),
      repo({ name: 'api', description: 'Gateway de APIs' }),
      repo({ name: 'x', topics: ['react'] }),
    ]) {
      expect(isNotesRepo(r), r.name).toBe(false)
    }
  })

  it('muitos commits e zero star: a partir de 50, com o número real', () => {
    expect(repoLineKind(repo({ name: 'x', totalCommits: 50, stars: 0 }), null)).toBe('underrated')
    expect(repoLineKind(repo({ name: 'x', totalCommits: 49, stars: 0 }), null)).toBeNull()
    expect(repoLineKind(repo({ name: 'x', totalCommits: 500, stars: 1 }), null)).toBeNull()
    expect(repoLineText('underrated', repo({ name: 'x', totalCommits: 170, stars: 0 }))).toBe('170 commits e zero star, mas o conteúdo é ouro.')
    expect(repoLineText('underrated', repo({ name: 'x', totalCommits: 1234, stars: 0 }))).toBe('1.234 commits e zero star, mas o conteúdo é ouro.')
  })

  it('vazio: até 1 commit, ou sem linguagens e sem README', () => {
    expect(repoLineKind(repo({ name: 'x', totalCommits: 0 }), null)).toBe('empty')
    expect(repoLineKind(repo({ name: 'x', totalCommits: 1 }), null)).toBe('empty')
    expect(repoLineKind(repo({ name: 'x', totalCommits: 30, languages: [], readme: undefined }), null)).toBe('empty')
    expect(repoLineKind(repo({ name: 'x', totalCommits: 30, languages: [] }), null)).toBeNull()
    expect(repoLineKind(repo({ name: 'x', totalCommits: 30, readme: undefined }), null)).toBeNull()
    expect(repoLineText('empty', repo({ name: 'x' }))).toBe('Esse aqui tá quietinho, hein.')
  })

  it('prioridade: favorito > caderno > muitos commits sem star > vazio', () => {
    const all = repo({ name: 'notes', totalCommits: 0, stars: 0, languages: [], readme: undefined })
    expect(repoLineKind(all, 'notes')).toBe('favorite')
    expect(repoLineKind(all, null)).toBe('notes')
    const underratedEmpty = repo({ name: 'x', totalCommits: 80, stars: 0, languages: [], readme: undefined })
    expect(repoLineKind(underratedEmpty, null)).toBe('underrated')
    expect(repoLineText('favorite', all)).toBe('Esse repo aqui é meu xodó, dá uma olhada.')
    expect(repoLineText('notes', all)).toBe('Ah, esse é meu caderninho de ideias.')
  })

  it('uma fala por chegada, sem repetir a mesma na sessão, e respeitando o intervalo entre falas do roteiro', () => {
    const s = fresh()
    const fav = repo({ name: 'fav', stars: 9 })
    const empty = repo({ name: 'vazio', totalCommits: 0 })
    // a fala do guia ("Olha que legal esse repo aqui!") acabou de sair: a chegada responde mesmo assim
    noteLine(s, 900)
    const d = direct(s, { type: 'arrival', repo: fav, favorite: 'fav' }, free(1000))
    expect(d?.line).toEqual({ text: SCRIPT_LINES.favorite, expression: 'happy' })
    // outro planeta logo em seguida: segura (intervalo)
    expect(direct(s, { type: 'arrival', repo: empty, favorite: 'fav' }, free(1000 + MIN_GAP_MS - 1))).toBeNull()
    // passado o intervalo, sai; o mesmo repo de novo, nunca
    expect(direct(s, { type: 'arrival', repo: empty, favorite: 'fav' }, free(1000 + MIN_GAP_MS))?.line?.text).toBe(SCRIPT_LINES.empty)
    expect(direct(s, { type: 'arrival', repo: fav, favorite: 'fav' }, free(100_000))).toBeNull()
    // repo sem nada a dizer
    expect(direct(s, { type: 'arrival', repo: repo({ name: 'comum' }), favorite: 'fav' }, free(200_000))).toBeNull()
  })

  it('não corta a fala que está no balão: guarda a do repo e solta quando o balão some (movimento reduzido: tudo no mesmo tick)', () => {
    const s = fresh()
    const fav = repo({ name: 'fav', stars: 9 })
    const open = { panelKey: 'planet:fav', reduced: true }
    // o guia acabou de falar e o painel abriu no mesmo instante
    noteLine(s, 1000)
    expect(direct(s, { type: 'arrival', repo: fav, favorite: 'fav' }, free(1000, { ...open, bubble: true }))).toBeNull()
    // balão ainda na tela: nada
    expect(direct(s, { type: 'tick' }, free(3000, { ...open, bubble: true }))).toBeNull()
    // balão sumiu: sai a do repo, sem esperar o intervalo das espontâneas
    expect(direct(s, { type: 'tick' }, free(5000, open))?.line).toEqual({ text: SCRIPT_LINES.favorite, expression: 'happy' })
    // e só uma vez
    expect(direct(s, { type: 'tick' }, free(6000, open))).toBeNull()
    expect(direct(s, { type: 'arrival', repo: fav, favorite: 'fav' }, free(100_000, open))).toBeNull()
  })

  it('a fala de repo guardada cai fora se o painel dela fechou antes (e pode sair noutra visita)', () => {
    const s = fresh()
    const fav = repo({ name: 'fav', stars: 9 })
    expect(direct(s, { type: 'arrival', repo: fav, favorite: 'fav' }, free(1000, { panelKey: 'planet:fav', bubble: true }))).toBeNull()
    // foi para outro planeta antes do balão sumir
    expect(direct(s, { type: 'tick' }, free(4000, { panelKey: 'planet:outro' }))).toBeNull()
    expect(s.pendingRepo).toBeNull()
    // de volta ao favorito depois: a fala não foi gasta
    expect(direct(s, { type: 'arrival', repo: fav, favorite: 'fav' }, free(20_000, { panelKey: 'planet:fav' }))?.line?.text).toBe(SCRIPT_LINES.favorite)
  })

  it('nunca no tutorial nem na apresentação', () => {
    const s = fresh()
    expect(direct(s, { type: 'arrival', repo: repo({ name: 'fav' }), favorite: 'fav' }, free(1000, { busy: true }))).toBeNull()
    // e não gastou a fala: depois, na mão do usuário, ela sai
    expect(direct(s, { type: 'arrival', repo: repo({ name: 'fav' }), favorite: 'fav' }, free(2000))?.line?.text).toBe(SCRIPT_LINES.favorite)
  })
})

describe('roteiro: ocioso (soneca)', () => {
  it('a fala de longa inatividade é a do bocejo, com a expressão sonolenta; a "Oi, tá aí?" segue igual', () => {
    expect(LINES.longIdle.text).toBe('Ô, dormiu? Clica num planeta aí.')
    expect(LINES.longIdle.expression).toBe('sleepy')
    expect(LINES.idle.text).toBe('Oi, tá aí?')
  })

  it('boceja e encosta na borda (com a fala do guia); qualquer entrada acorda', () => {
    const s = fresh()
    const d = direct(s, { type: 'longIdle' }, free(60_000))
    expect(d).toMatchObject({ action: 'sleep', guide: 'longIdle', motion: true, line: null })
    // dormindo: outro aviso de inatividade não faz nada
    expect(direct(s, { type: 'longIdle' }, free(120_000))).toBeNull()
    expect(direct(s, { type: 'wake' }, free(121_000))).toMatchObject({ action: 'wake', line: null, guide: null })
    // acordado, acordar de novo não faz nada
    expect(direct(s, { type: 'wake' }, free(122_000))).toBeNull()
  })

  it('só com a nave estacionada no canto, fora do tutorial e da apresentação', () => {
    expect(direct(fresh(), { type: 'longIdle' }, free(60_000, { parked: false }))).toBeNull()
    expect(direct(fresh(), { type: 'longIdle' }, free(60_000, { busy: true }))).toBeNull()
  })

  it('com um balão na tela, boceja calado', () => {
    expect(direct(fresh(), { type: 'longIdle' }, free(60_000, { bubble: true }))).toMatchObject({ action: 'sleep', guide: null })
  })
})

describe('roteiro: janela apertada', () => {
  it('se firma, surpreso, e reclama; espera ~60 s para reagir de novo', () => {
    const s = fresh()
    const d = direct(s, { type: 'shrink' }, free(10_000, { bubble: true }))
    expect(d).toMatchObject({ action: 'brace', motion: true, line: { text: 'Ei ei ei, tá apertando meu universo!', expression: 'surprised' } })
    expect(direct(s, { type: 'shrink' }, free(10_000 + SHRINK_COOLDOWN_MS - 1))).toBeNull()
    expect(direct(s, { type: 'shrink' }, free(10_000 + SHRINK_COOLDOWN_MS))?.action).toBe('brace')
  })

  it('no tutorial ou na apresentação, só a reação, sem fala', () => {
    expect(direct(fresh(), { type: 'shrink' }, free(10_000, { busy: true }))).toMatchObject({ action: 'brace', line: null })
  })

  it('acorda quem estava cochilando', () => {
    const s = fresh()
    direct(s, { type: 'longIdle' }, free(60_000))
    direct(s, { type: 'shrink' }, free(61_000))
    expect(s.sleeping).toBe(false)
  })
})

describe('roteiro: zoom demais', () => {
  it('fica tonto (com uma fala do grupo tonto) e espera antes de ficar de novo', () => {
    const s = fresh()
    const d = direct(s, { type: 'zoomDizzy', text: 'O universo tá girando…' }, free(5000, { bubble: true }))
    expect(d).toMatchObject({ action: 'dizzy', motion: true, line: { text: 'O universo tá girando…', expression: 'dizzy' } })
    expect(direct(s, { type: 'zoomDizzy', text: 'x' }, free(5000 + ZOOM_DIZZY_COOLDOWN_MS - 1))).toBeNull()
    expect(direct(s, { type: 'zoomDizzy', text: 'x' }, free(5000 + ZOOM_DIZZY_COOLDOWN_MS))?.action).toBe('dizzy')
  })

  it('no tutorial ou na apresentação, tonto calado', () => {
    expect(direct(fresh(), { type: 'zoomDizzy', text: 'x' }, free(5000, { busy: true }))).toMatchObject({ action: 'dizzy', line: null })
  })
})

describe('roteiro: fps', () => {
  it('uma vez por sessão, esperando a vez como qualquer fala espontânea', () => {
    const s = fresh()
    expect(direct(s, { type: 'smoothFps' }, free(70_000, { busy: true }))).toBeNull()
    const d = direct(s, { type: 'tick' }, free(71_000))
    expect(d?.line).toEqual({ text: 'Tá rodando liso aí? Capricharam na otimização, viu.', expression: 'wink' })
    expect(direct(s, { type: 'smoothFps' }, free(200_000))).toBeNull()
    expect(direct(s, { type: 'tick' }, free(300_000))).toBeNull()
  })

  it('o recrutador vem antes do fps na fila, e um espera o intervalo do outro', () => {
    const s = fresh()
    direct(s, { type: 'smoothFps' }, free(1000, { busy: true }))
    direct(s, { type: 'recruiter', text: SCRIPT_LINES.recruiterClean }, free(1000, { busy: true }))
    expect(direct(s, { type: 'tick' }, free(2000))?.line?.text).toBe(SCRIPT_LINES.recruiterClean)
    expect(direct(s, { type: 'tick' }, free(2000 + MIN_GAP_MS - 1))).toBeNull()
    expect(direct(s, { type: 'tick' }, free(2000 + MIN_GAP_MS))?.line?.text).toBe(SCRIPT_LINES.smooth)
  })
})

describe('roteiro: movimento reduzido', () => {
  it('as falas e as expressões continuam; encostar, firmar e bambear, não', () => {
    const reduced = (now: number) => free(now, { reduced: true })
    expect(direct(fresh(), { type: 'longIdle' }, reduced(60_000))).toMatchObject({ action: 'sleep', guide: 'longIdle', motion: false })
    expect(direct(fresh(), { type: 'shrink' }, reduced(10_000))).toMatchObject({ action: 'brace', motion: false, line: { text: SCRIPT_LINES.squeeze } })
    expect(direct(fresh(), { type: 'zoomDizzy', text: 'x' }, reduced(5000))).toMatchObject({ action: 'dizzy', motion: false, line: { text: 'x' } })
    expect(direct(fresh(), { type: 'arrival', repo: repo({ name: 'f' }), favorite: 'f' }, reduced(1000))?.line?.text).toBe(SCRIPT_LINES.favorite)
  })
})
