import { useEffect, useMemo } from 'react'
import { favoriteRepo } from '@/lib/octocat/script'
import type { Universe } from '@/lib/types'
import { cue } from '@/store/fourthWall'
import { usePanelReadyKey } from '@/store/panelReady'

/** O painel de um repo abriu (a nave chegou nele): o Octocat comenta o repo, se tiver o que dizer (lib/octocat/script). */
export function usePanelArrivalCue(universe: Pick<Universe, 'profile' | 'repos'>): void {
  const favorite = useMemo(() => favoriteRepo(universe), [universe])
  useEffect(
    () =>
      usePanelReadyKey.subscribe((state, prev) => {
        const key = state.key
        if (key === prev.key || !key?.startsWith('planet:')) return
        const name = key.slice('planet:'.length)
        const repo = universe.repos.find((r) => r.name === name)
        if (repo) cue({ type: 'arrival', repo, favorite })
      }),
    [universe, favorite],
  )
}
