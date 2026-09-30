import { createInterface } from 'node:readline';
import type { ExtensionVersion, TrustDecision } from '@kvman/kernel';

// The trust prompt (plan 02 §2.9, ADR 0009, 48): `--yes` accepts every new version; otherwise kvman lists them and asks
// y/N in the terminal, and only `y` accepts (Ctrl+C or the end of input declines). With no terminal, it can't ask, so it
// refuses.

export type Terminal = { input: NodeJS.ReadableStream; output: NodeJS.WritableStream; isTerminal: boolean };

function ask(terminal: Terminal, question: string): Promise<string> {
  const lines = createInterface({ input: terminal.input, output: terminal.output });
  return new Promise<string>((resolve) => {
    lines.once('close', () => resolve(''));
    lines.once('SIGINT', () => lines.close());
    lines.question(question, (answer) => {
      resolve(answer);
      lines.close();
    });
  });
}

export function trustDecision(yes: boolean, terminal: Terminal): TrustDecision {
  return async (versions: readonly ExtensionVersion[]) => {
    if (yes) return true;
    if (!terminal.isTerminal) return false;
    const listed = versions.map((version) => `  ${version.name}@${version.version} (${version.source})\n`).join('');
    terminal.output.write(`These extension versions haven't been accepted before:\n${listed}`);
    const answer = await ask(terminal, 'Load them? [y/N] ');
    return answer.trim().toLowerCase() === 'y';
  };
}
