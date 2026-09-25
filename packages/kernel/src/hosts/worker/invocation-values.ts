import type { NewRecordedValues, RecordedValues } from '@kvman/protocol';

// ctx.ids.new() and ctx.now() (ADR 0070): the n-th call returns the value an earlier attempt recorded, else a new
// one that waits in `pending` until the next journaled write carries it to the kernel.
export class InvocationValues {
  readonly #replay: RecordedValues;
  readonly #newId: () => string;
  readonly #clock: () => number;
  readonly #recorded: boolean;
  #pending: NewRecordedValues = { id: [], now: [] };
  #ids = 0;
  #times = 0;

  constructor(replay: RecordedValues, newId: () => string, clock: () => number, recorded: boolean) {
    this.#replay = replay;
    this.#newId = newId;
    this.#clock = clock;
    this.#recorded = recorded;
  }

  id(): string {
    this.#ids += 1;
    const replayed = this.#replay.id[this.#ids - 1];
    if (replayed !== undefined) return replayed;
    const value = this.#newId();
    if (this.#recorded) this.#pending.id.push({ n: this.#ids, value });
    return value;
  }

  now(): number {
    this.#times += 1;
    const replayed = this.#replay.now[this.#times - 1];
    if (replayed !== undefined) return replayed;
    const value = this.#clock();
    if (this.#recorded) this.#pending.now.push({ n: this.#times, value });
    return value;
  }

  flush(): NewRecordedValues {
    const pending = this.#pending;
    this.#pending = { id: [], now: [] };
    return pending;
  }
}
