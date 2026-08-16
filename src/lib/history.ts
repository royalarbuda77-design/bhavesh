export class SnapshotHistory<T> {
  private states: T[] = []
  private position = -1
  constructor(private readonly max = 60) {}

  push(state: T) {
    this.states = this.states.slice(0, this.position + 1)
    this.states.push(structuredClone(state))
    if (this.states.length > this.max) this.states.shift()
    this.position = this.states.length - 1
  }
  undo(): T | undefined {
    if (!this.canUndo) return undefined
    this.position -= 1
    return structuredClone(this.states[this.position])
  }
  redo(): T | undefined {
    if (!this.canRedo) return undefined
    this.position += 1
    return structuredClone(this.states[this.position])
  }
  get canUndo() { return this.position > 0 }
  get canRedo() { return this.position >= 0 && this.position < this.states.length - 1 }
  clear(state?: T) {
    this.states = []
    this.position = -1
    if (state !== undefined) this.push(state)
  }
}
