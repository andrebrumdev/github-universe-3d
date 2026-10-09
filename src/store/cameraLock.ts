import { create } from 'zustand'

/**
 * Trava da rotação da câmera enquanto alguém gira o sol: o Sun liga no aperto sobre o sol e desliga ao soltar; o
 * CameraRig só lê (o CameraControls fica desligado enquanto estiver travado).
 */
export const useCameraLock = create<{ sunDrag: boolean }>(() => ({ sunDrag: false }))
