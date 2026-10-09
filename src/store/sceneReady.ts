import { create } from 'zustand'

/**
 * A cena 3D já desenhou o primeiro quadro. Até lá o Loader fica na tela, e o tutorial e os botões flutuantes esperam
 * (numa rede lenta, o pedaço do 3D chega segundos depois dos dados). Volta a false quando a cena desmonta.
 */
export const useSceneReady = create<{ ready: boolean; setReady: (ready: boolean) => void }>()((set) => ({
  ready: false,
  setReady: (ready) => set({ ready }),
}))
