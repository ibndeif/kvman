import type { Pipe } from './pipe/pipe.ts';

// What a run says on stdout as it goes: sentences for a person at a terminal (plan 01 §1.2), or lines for the program
// that started it (plan 14 §14.2).

export type RunReport = {
  running(url: string, port: number): void;
  joined(url: string, port: number): void;
  restarting(): void;
};

export function terminalReport(output: NodeJS.WritableStream): RunReport {
  return {
    running: (url) => {
      output.write(`kvman is running at ${url}\n`);
    },
    joined: (url) => {
      output.write(`kvman is already running; this folder is open at ${url}\n`);
    },
    restarting: () => {
      output.write('kvman is restarting…\n');
    },
  };
}

export function pipeReport(pipe: Pipe): RunReport {
  return {
    running: (url, port) => pipe.write({ kind: 'running', url, port }),
    joined: (url, port) => pipe.write({ kind: 'joined', url, port }),
    restarting: () => pipe.write({ kind: 'restarting' }),
  };
}
