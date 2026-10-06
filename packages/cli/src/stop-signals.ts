// Ctrl+C and SIGTERM (plan 02 §2.14, ADR 0009, 50): the first signal starts the stop sequence; a second one stops at
// once through `atOnce`.

const signals = ['SIGINT', 'SIGTERM'] as const;

export type StopSignals = { stopRequested: Promise<void>; isRequested(): boolean; dispose(): void };

export function listenForStop(atOnce: () => void): StopSignals {
  let requested = false;
  let request: () => void = () => undefined;
  const stopRequested = new Promise<void>((resolve) => {
    request = resolve;
  });
  const onSignal = (): void => {
    if (requested) {
      atOnce();
      return;
    }
    requested = true;
    request();
  };
  for (const signal of signals) process.on(signal, onSignal);
  return {
    stopRequested,
    isRequested: () => requested,
    dispose: () => {
      for (const signal of signals) process.off(signal, onSignal);
    },
  };
}
