import { createInterface } from 'node:readline';
import type { UninstallArguments } from '../arguments.ts';
import type { Terminal } from '../trust-prompt.ts';

// The two questions of `kvman uninstall` (ADR 0031, 1 and 4): whether to remove kvman, then whether to delete its
// data. Only `y` agrees, as for the trust question (ADR 0009, 48). `--yes` answers the first and never the second;
// `--keep-data` and `--delete-data` answer the second, and `--yes` alone keeps the data. With no terminal a question
// that no flag answers can't be asked.

export type Answers = { kind: 'declined' } | { kind: 'unanswered'; flag: string } | { kind: 'agreed'; deleteData: boolean };

type Asker = { ask(question: string): Promise<string>; close(): void };

// Lines are kept as they arrive, so two answers typed or piped at once both count; the end of input answers ''.
function asker(terminal: Terminal): Asker {
  const lines = createInterface({ input: terminal.input });
  const arrived: string[] = [];
  const waiting: ((line: string) => void)[] = [];
  let ended = false;
  lines.on('line', (line) => {
    const next = waiting.shift();
    if (next === undefined) arrived.push(line);
    else next(line);
  });
  lines.once('close', () => {
    ended = true;
    for (const next of waiting.splice(0)) next('');
  });
  return {
    ask: (question) => {
      terminal.output.write(question);
      const line = arrived.shift();
      if (line !== undefined) return Promise.resolve(line);
      return ended ? Promise.resolve('') : new Promise<string>((resolve) => waiting.push(resolve));
    },
    close: () => lines.close(),
  };
}

const agrees = (answer: string): boolean => answer.trim().toLowerCase() === 'y';

export async function askWhatToRemove(args: UninstallArguments, home: string, terminal: Terminal): Promise<Answers> {
  if (args.yes) return { kind: 'agreed', deleteData: args.data === 'delete' };
  if (!terminal.isTerminal) return { kind: 'unanswered', flag: '--yes' };
  const questions = asker(terminal);
  try {
    if (!agrees(await questions.ask('Remove kvman? [y/N] '))) return { kind: 'declined' };
    if (args.data !== 'ask') return { kind: 'agreed', deleteData: args.data === 'delete' };
    terminal.output.write(`\nYour data is in ${home}\n(chats, provider keys, presets).\n`);
    return { kind: 'agreed', deleteData: agrees(await questions.ask('Delete it too? [y/N] ')) };
  } finally {
    questions.close();
  }
}
