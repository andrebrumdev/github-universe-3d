import { create } from 'zustand'
import { crashOverride, INITIAL_CRASH_HISTORY, type CrashHistory, type CrashOverride } from '@/lib/crash/rarity'

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
 * Relógio da trombada: segundos de cena desde o impacto (−1: nenhuma em curso), escrito pela nave a cada quadro com o
 * mesmo passo da simulação. A camada do vidro e as estrelinhas leem daqui: num quadro lento (passo travado) tudo
 * desacelera junto com a nave, sem a trinca sumir antes da hora.
 */
export const crashClock = { since: -1 }

/** Voltas desta sessão (vale enquanto a página fica aberta; uma remontagem da cena não zera). */
export const crashSession: { history: CrashHistory; rng: () => number } = {
  history: { ...INITIAL_CRASH_HISTORY },
  rng: Math.random,
}

/** `?crash` (só em dev) força a trombada em toda volta elegível; `?nocrash` desliga (e2e). */
export const CRASH_OVERRIDE: CrashOverride = crashOverride(window.location.search, import.meta.env.DEV)
