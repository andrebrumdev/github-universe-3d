import { LINE_DURATION_MS } from '../octocat/lines'
import type { SunMode } from './sunMachine'

/**
 * Eventos que o humor do sol precisa (mood.ts), tirados de um retrato da cena a cada quadro — sem `useFrame`, sem
 * alocar: o Sun reaproveita o retrato, o estado e a saída. Transições: a nave chegou num planeta, quem interagia
 * saiu, trombada (impacto / risada só depois da fala), cometa entrando perto do periélio, aba voltando depois de
 * muito tempo escondida.
 */

/** A aba precisa ficar escondida mais que isto (ms) para o sol "acordar" quando ela volta. */
export const TAB_AWAY_MS = 10_000
/** A risada dura o mesmo que a fala do Octocat no balão. */
export const LAUGH_SECONDS = LINE_DURATION_MS / 1000

/** Retrato da cena num quadro (valores simples, lidos dos stores pelo Sun). */
export interface SunSnapshot {
  /** Relógio da cena (s). */
  t: number
  profileOpen: boolean
  /** Modo da máquina do sol (hover/away vêm do mouse perto). */
  mode: SunMode
  /** Modo da nave (`shipPose.mode`) e o planeta alvo dela, se houver. */
  shipMode: string
  shipTarget: string | null
  /** Linha do tempo da trombada correndo e não cancelada. */
  crashActive: boolean
  /** Quantas falas de desculpa da trombada já saíram de verdade (`crashApology.count`). */
  apologies: number
  /** Algum cometa perto do periélio agora. */
  cometNear: boolean
  /** Quanto tempo (ms) a aba ficou escondida, informado uma vez no quadro em que ela volta; 0 nos outros. */
  tabHiddenMs: number
}

/** Estado interno entre quadros. */
export interface SunEventState {
  startAt: number
  profileOpen: boolean
  mode: SunMode
  shipMode: string
  apologies: number
  arrivalAt: number
  arrivalPlanet: string | null
  laughUntil: number
  cometNearAt: number
  tabReturnAt: number
  leaveAt: number
}

/** Saída: as idades e marcas que o `MoodContext` usa. */
export interface SunEvents {
  sinceStart: number
  sinceArrival: number
  arrivalPlanet: string | null
  crash: 'none' | 'impact' | 'laugh'
  /** Infinity fora da zona do periélio. */
  sinceCometNear: number
  sinceTabReturn: number
  sinceLeave: number
}

export function newSunSnapshot(): SunSnapshot {
  return { t: 0, profileOpen: false, mode: 'idle', shipMode: 'entering', shipTarget: null, crashActive: false, apologies: 0, cometNear: false, tabHiddenMs: 0 }
}

export function newSunEventState(): SunEventState {
  return {
    startAt: Number.NaN,
    profileOpen: false,
    mode: 'idle',
    shipMode: 'entering',
    apologies: 0,
    arrivalAt: -Infinity,
    arrivalPlanet: null,
    laughUntil: -Infinity,
    cometNearAt: Number.NaN,
    tabReturnAt: -Infinity,
    leaveAt: -Infinity,
  }
}

export function newSunEvents(): SunEvents {
  return { sinceStart: 0, sinceArrival: Infinity, arrivalPlanet: null, crash: 'none', sinceCometNear: Infinity, sinceTabReturn: Infinity, sinceLeave: Infinity }
}

const isTravel = (mode: string) => mode === 'traveling' || mode === 'returning'

/** Avança um quadro: atualiza `s` e escreve os eventos em `out` (devolvido). */
export function deriveSunEvents(s: SunEventState, snap: SunSnapshot, out: SunEvents): SunEvents {
  const { t } = snap
  if (Number.isNaN(s.startAt)) {
    s.startAt = t
    s.apologies = snap.apologies
  }
  // nave chegou num planeta (vinda de uma viagem)
  if (isTravel(s.shipMode) && snap.shipMode === 'visiting') {
    s.arrivalAt = t
    s.arrivalPlanet = snap.shipTarget
  }
  s.shipMode = snap.shipMode
  // quem interagia saiu: fechou o painel do perfil, ou o mouse foi embora do sol
  if ((s.profileOpen && !snap.profileOpen) || (s.mode === 'hover' && snap.mode === 'away')) s.leaveAt = t
  s.profileOpen = snap.profileOpen
  s.mode = snap.mode
  // risada só quando a fala de desculpa saiu de verdade (o contador sobe), pelo tempo da fala
  if (snap.apologies > s.apologies) s.laughUntil = t + LAUGH_SECONDS
  s.apologies = snap.apologies
  // cometa: conta desde a entrada na zona perto do periélio
  if (snap.cometNear && Number.isNaN(s.cometNearAt)) s.cometNearAt = t
  if (!snap.cometNear) s.cometNearAt = Number.NaN
  // aba: voltou depois de muito tempo escondida
  if (snap.tabHiddenMs > TAB_AWAY_MS) s.tabReturnAt = t

  out.sinceStart = t - s.startAt
  out.sinceArrival = t - s.arrivalAt
  out.arrivalPlanet = s.arrivalPlanet
  out.crash = snap.crashActive ? 'impact' : t < s.laughUntil ? 'laugh' : 'none'
  out.sinceCometNear = Number.isNaN(s.cometNearAt) ? Infinity : t - s.cometNearAt
  out.sinceTabReturn = t - s.tabReturnAt
  out.sinceLeave = t - s.leaveAt
  return out
}

/** Nave passando raspando: a menos disto do centro do sol, em raios do sol (cobre o estilingue, que passa perto). */
export const CLOSE_PASS_RADII = 4

/** Raspão: a nave em viagem a menos de `CLOSE_PASS_RADII` raios do sol (`distance` em raios). */
export function isClosePass(traveling: boolean, distanceInRadii: number): boolean {
  return traveling && distanceInRadii < CLOSE_PASS_RADII
}
