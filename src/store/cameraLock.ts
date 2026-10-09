import { create } from 'zustand'

/**
 * Trava da câmera com dono: quem gira uma peça arrastando (a nave no modo de foco, o sol) pega a trava no próprio
 * `pointerdown` e só o dono solta. Ela é aplicada na hora, direto na instância do CameraControls (`bindCameraLock`,
 * ligada pelo CameraRig), sem esperar um render do React e sem parar a propagação do evento nativo:
 * - desliga só o giro de um ponteiro (botão esquerdo e um dedo); rodinha, botão do meio e dois dedos (pinça) seguem;
 * - chama `cancel()`, para o caso de o CameraControls já ter começado um giro com este aperto.
 * Nada de `enabled = false`: isso também limparia o `touch-action` do canvas e o navegador poderia dar zoom na página.
 */
export type CameraLockOwner = 'ship' | 'sun'

export const useCameraLock = create<{ owner: CameraLockOwner | null }>(() => ({ owner: null }))

/** Pega a trava (síncrono). Falso se outro dono está com ela. */
export function acquireCameraLock(owner: CameraLockOwner): boolean {
  const current = useCameraLock.getState().owner
  if (current !== null && current !== owner) return false
  if (current !== owner) useCameraLock.setState({ owner })
  return true
}

/** Solta a trava, se `owner` for o dono. */
export function releaseCameraLock(owner: CameraLockOwner): void {
  if (useCameraLock.getState().owner === owner) useCameraLock.setState({ owner: null })
}

/** O que a trava mexe no CameraControls (a instância do camera-controls cumpre isto). */
export interface LockableControls {
  mouseButtons: { left: number }
  touches: { one: number }
  cancel: () => void
}

/**
 * Liga a trava a uma instância do CameraControls: aplica na hora a cada troca de dono (a assinatura do zustand roda
 * dentro do `setState`, no mesmo instante do `acquire`) e devolve quem desliga (devolvendo os botões, se travado).
 * `none` é o `ACTION.NONE` do camera-controls.
 */
export function bindCameraLock(controls: LockableControls, none: number): () => void {
  let saved: { left: number; one: number } | null = null
  const apply = (locked: boolean) => {
    if (locked && !saved) {
      saved = { left: controls.mouseButtons.left, one: controls.touches.one }
      controls.mouseButtons.left = none
      controls.touches.one = none
      controls.cancel()
    } else if (!locked && saved) {
      controls.mouseButtons.left = saved.left
      controls.touches.one = saved.one
      saved = null
    }
  }
  apply(useCameraLock.getState().owner !== null)
  const unsubscribe = useCameraLock.subscribe((s) => apply(s.owner !== null))
  return () => {
    unsubscribe()
    apply(false)
  }
}
