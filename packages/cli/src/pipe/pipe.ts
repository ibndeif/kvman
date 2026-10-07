import { createInterface } from 'node:readline';
import type { Terminal } from '../trust-prompt.ts';
import { encodeLine, type PipeLine } from './pipe-lines.ts';

// A piped run's two ends (plan 14 §14.2): the lines kvman writes on stdout, and its stdin read as lines for the whole
// run. A line that nobody waits for is dropped, and the input's end is what stops kvman (ADR 0038, 16).

export type Pipe = {
  write(line: PipeLine): void;
  // The next line, or `undefined` once the input has ended.
  nextLine(): Promise<string | undefined>;
  // Resolves when the input ends by itself, not when `dispose` stops reading.
  ended: Promise<void>;
  hasEnded(): boolean;
  // Stops reading, so an input that is still open doesn't keep the process alive.
  dispose(): void;
};

export function openPipe(terminal: Terminal): Pipe {
  const lines = createInterface({ input: terminal.input });
  let ended = false;
  let disposed = false;
  let waiting: ((line: string | undefined) => void) | undefined;
  let end: () => void = () => undefined;
  const whenEnded = new Promise<void>((resolve) => {
    end = resolve;
  });
  const answer = (line: string | undefined): void => {
    const waiter = waiting;
    waiting = undefined;
    waiter?.(line);
  };
  lines.on('line', answer);
  lines.once('close', () => {
    if (disposed) return;
    ended = true;
    answer(undefined);
    end();
  });
  return {
    write: (line) => {
      terminal.output.write(encodeLine(line));
    },
    nextLine: () =>
      ended
        ? Promise.resolve(undefined)
        : new Promise((resolve) => {
            waiting = resolve;
          }),
    ended: whenEnded,
    hasEnded: () => ended,
    dispose: () => {
      disposed = true;
      lines.close();
    },
  };
}
