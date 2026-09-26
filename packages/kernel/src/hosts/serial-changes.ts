// ADR 0123: the kernel commands that check the registry and then change it (install, uninstall, enable, disable,
// the end of a forget) run one at a time, each against the registry the previous one left.
export class SerialChanges {
  #last: Promise<void> = Promise.resolve();

  run<Result>(change: () => Promise<Result>): Promise<Result> {
    const result = this.#last.then(change);
    // The next change waits for this one to end either way; its caller receives the outcome through `result`.
    this.#last = result.then(() => undefined, () => undefined);
    return result;
  }
}
