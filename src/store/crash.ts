import { create } from 'zustand'
import { crashOverride, INITIAL_CRASH_HISTORY, type CrashHistory, type CrashOverride } from '@/lib/crash/rarity'
import { crashOverlayOn, crashReset, newCrashTimeline, type CrashTimeline } from '@/lib/crash/timeline'
import { useUniverse } from './universe'

/** Impacto na tela: ponto (px, tela cheia como o canvas) e semente da trinca; `seq` sobe a cada trombada. */
export interface CrashImpact {
  seq: number
  x: number
  y: number
  seed: number
}

interface CrashStore {
  impact: CrashImpact | null
  hit: (x: number, y: number, seed: number) => void
  /** A camada da trinca terminou de se consertar (só limpa se ainda é a mesma trombada). */
  clear: (seq: number) => void
}

export const useCrash = create<CrashStore>((set, get) => ({
  impact: null,
  hit: (x, y, seed) => set({ impact: { seq: (get().impact?.seq ?? 0) + 1, x, y, seed } }),
  clear: (seq) => {
    if (get().impact?.seq === seq) set({ impact: null })
  },
}))

/**
 * Linha do tempo da trombada em curso (lib/crash/timeline), escrita pela nave a cada quadro com o passo da simulação.
 * A camada do vidro e as estrelinhas leem daqui: num quadro lento (passo travado) tudo desacelera junto com a nave.
 */
export const crashTimeline: CrashTimeline = newCrashTimeline()

/**
 * Câmera durante o voo da trombada: `hold` enquanto a nave vem para a lente (até o impacto) — a câmera para onde está
 * (sem ir para a visão geral nem enquadrar uma chegada). Escrito pela nave a cada quadro; lido pelo CameraRig.
 */
export const crashCamera = { hold: false }

/** A camada do vidro já pode sair (curou, foi cancelada e curou, ou a trombada acabou). */
export function overlayExpired(tl: CrashTimeline): boolean {
  return !crashOverlayOn(tl)
}

/** Encerra a trombada na hora (a nave desmontou no meio): sem camada, sem estrelas, sem fala. */
export function endCrash(): void {
  crashReset(crashTimeline)
  useCrash.setState({ impact: null })
}

/**
 * Falas de desculpa da trombada que saíram de verdade: sobe quando o balão do Octocat mostra a fala 'crash' (a nave
 * só a emite quando a linha do tempo chega à fala sem cancelamento). Cancelada, encerrada à força (`endCrash`) ou
 * cancelada entre dois quadros, nenhuma fala sai e o contador não sobe. O sol ri só quando ele sobe (sunEvents).
 */
export const crashApology = { count: 0 }

useUniverse.subscribe((state, prev) => {
  if (state.bubble && state.bubble !== prev.bubble && state.bubble.line.id === 'crash') crashApology.count++
})

/** Voltas desta sessão (vale enquanto a página fica aberta; uma remontagem da cena não zera). */
export const crashSession: { history: CrashHistory; rng: () => number } = {
  history: { ...INITIAL_CRASH_HISTORY },
  rng: Math.random,
}

/** `?crash` (só em dev) força a trombada em toda volta elegível; `?nocrash` desliga (e2e). */
export const CRASH_OVERRIDE: CrashOverride = crashOverride(typeof window === 'undefined' ? '' : window.location.search, import.meta.env.DEV)
