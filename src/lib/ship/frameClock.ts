/**
 * Passo de quadro suavizado, o mesmo para a nave e a câmera. O delta do R3F sai do `performance.now()` na hora em que
 * o callback roda, que treme alguns milissegundos em volta do vsync; a tela, porém, mostra os quadros em cadência
 * fixa. Andar a nave com o delta tremido dá passos desiguais na tela (as "engasgadas" no voo). Aqui o passo é a média
 * móvel do delta (a cadência da tela), mais uma devolução lenta da diferença acumulada para a soma acompanhar o tempo
 * de verdade. Um passo por quadro: quem pede de novo no mesmo quadro (`frame`) recebe o mesmo valor.
 */
import { MAX_FRAME_DT } from './motion'

/** Ritmo da média do passo e quanto da diferença acumulada volta por quadro. */
const AVERAGE_RATE = 0.08
const DEBT_RATE = 0.05
/** A devolução nunca passa desta fração do passo (sem acelerar ou frear de uma vez). */
const DEBT_LIMIT = 0.2

export class FrameClock {
  private average = 1 / 60
  private debt = 0
  private frame: number | null = null
  private last = 0

  step(frame: number, rawDt: number): number {
    if (frame === this.frame) return this.last
    this.frame = frame
    const raw = Math.min(Math.max(rawDt, 0), MAX_FRAME_DT)
    if (raw === 0) return (this.last = 0)
    // um quadro bem fora da média (engasgo de verdade, aba voltando) vale como veio
    if (raw > 2.5 * this.average || raw < 0.4 * this.average) {
      this.average += (raw - this.average) * AVERAGE_RATE
      return (this.last = raw)
    }
    this.average += (raw - this.average) * AVERAGE_RATE
    this.debt += raw - this.average
    const pay = Math.max(-DEBT_LIMIT * this.average, Math.min(DEBT_LIMIT * this.average, this.debt * DEBT_RATE))
    this.debt -= pay
    return (this.last = Math.min(MAX_FRAME_DT, this.average + pay))
  }
}
