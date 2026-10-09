import { useEffect } from 'react'
import { RECRUITER_DWELL_MS, RECRUITER_LINK_DELAY_MS, recruiterFromReferrer, recruiterFromUrl, recruiterLine } from '@/lib/octocat/script'
import type { Universe } from '@/lib/types'
import { cue, isFirstVisit, readFlag, RECRUITER_SEEN_KEY } from '@/store/fourthWall'

/**
 * "Psiu, você é recrutador?": não dá para saber, então o palpite vem do link (`?ref=recrutador`…), de quem trouxe o
 * visitante (LinkedIn, sites de vaga) ou, na primeira visita, de ~25 s na página (montado só com a cena pronta). Uma
 * vez por visitante; o diretor segura a fala até o tutorial, a apresentação e o balão saírem da frente.
 */
export function useRecruiterCue(universe: Pick<Universe, 'profile' | 'repos'>): void {
  useEffect(() => {
    if (readFlag(RECRUITER_SEEN_KEY)) return
    const firstVisit = isFirstVisit()
    const linked = recruiterFromUrl(window.location.search) || recruiterFromReferrer(document.referrer)
    if (!linked && !firstVisit) return
    const text = recruiterLine(universe)
    const timer = window.setTimeout(() => cue({ type: 'recruiter', text }), linked ? RECRUITER_LINK_DELAY_MS : RECRUITER_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [universe])
}
