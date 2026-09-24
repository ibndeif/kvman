import type { Priority } from '@kvman/protocol';
import type { AdmittedMessage } from '../storage/commit-unit.ts';

const classes: readonly Priority[] = ['interactive', 'normal', 'background'];

// Queries wait here, never in lanes or behind command limits (03 §3.4): by class, then in arrival order.
export class QueryQueue {
  readonly #waiting: Record<Priority, AdmittedMessage[]> = { interactive: [], normal: [], background: [] };

  push(query: AdmittedMessage): void {
    this.#waiting[query.message.priority].push(query);
  }

  // Offers each waiting query in order; `dispatch` answers whether its host took it.
  drain(dispatch: (query: AdmittedMessage) => boolean): void {
    for (const priority of classes) {
      this.#waiting[priority] = this.#waiting[priority].filter((query) => !dispatch(query));
    }
  }
}
