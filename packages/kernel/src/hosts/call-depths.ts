// ADR 0085: the depth of an invocation is the number of callers above it waiting for it through ctx.command.
export const maxCommandDepth = 8;

export class CallDepths {
  readonly #callers = new Map<string, string>();

  depthOf(messageId: string): number {
    let depth = 0;
    for (let caller = this.#callers.get(messageId); caller !== undefined; caller = this.#callers.get(caller)) depth += 1;
    return depth;
  }

  waiting(calleeId: string, callerId: string): void {
    this.#callers.set(calleeId, callerId);
  }

  answered(calleeId: string): void {
    this.#callers.delete(calleeId);
  }
}
