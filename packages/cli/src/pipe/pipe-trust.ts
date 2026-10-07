import type { TrustDecision } from '@kvman/kernel';
import type { Pipe } from './pipe.ts';
import { acceptsTrust, trustLine } from './pipe-lines.ts';

// The trust question of a piped run (plan 02 §2.9, plan 14 §14.2): a `trust` line, then the next line of the input as
// the answer. It is asked with or without a terminal, and an input that ends declines.

export function pipeTrustDecision(yes: boolean, pipe: Pipe, language: () => string): TrustDecision {
  return async (versions) => {
    if (yes) return true;
    pipe.write(trustLine(language(), versions));
    const answer = await pipe.nextLine();
    return answer !== undefined && acceptsTrust(answer);
  };
}
