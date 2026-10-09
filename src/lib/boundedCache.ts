/**
 * Cache com teto: guarda no máximo `limit` entradas e, passando dele, a menos usada recentemente sai primeiro. Para
 * memoizar por uma chave que pode variar sem fim (o tamanho da janela num redimensionamento arrastado, por exemplo).
 */
export class BoundedCache<K, V> {
  private readonly map = new Map<K, V>()
  readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  get size(): number {
    return this.map.size
  }

  /** O valor da chave (e ela passa a ser a mais recente), ou undefined. */
  get(key: K): V | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    this.map.delete(key)
    this.map.set(key, value)
    // o Map itera na ordem de inserção: a primeira chave é a menos usada recentemente
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value as K)
  }
}
