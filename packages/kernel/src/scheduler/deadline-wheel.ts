// Message deadlines in time order (03 §3.4): pending messages from the index and awaiting ones from the scheduler.
export class DeadlineWheel {
  readonly #at = new Map<string, number>();
  readonly #order: Array<{ id: string; at: number }> = [];

  watch(id: string, at: number): void {
    if (this.#at.get(id) === at) return;
    this.forget(id);
    this.#at.set(id, at);
    const position = this.#order.findIndex((due) => due.at > at);
    this.#order.splice(position === -1 ? this.#order.length : position, 0, { id, at });
  }

  forget(id: string): void {
    if (!this.#at.delete(id)) return;
    this.#order.splice(this.#order.findIndex((due) => due.id === id), 1);
  }

  due(now: number): string[] {
    const due: string[] = [];
    for (let next = this.#order[0]; next !== undefined && next.at <= now; next = this.#order[0]) {
      this.#order.shift();
      this.#at.delete(next.id);
      due.push(next.id);
    }
    return due;
  }

  next(): number | undefined {
    return this.#order[0]?.at;
  }
}
