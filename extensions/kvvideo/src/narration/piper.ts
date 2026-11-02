import { lastLines, runProgram, type Program } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';

// Piper on this computer (plan 16 §16.6; ADR 0107, 22): it speaks one sentence into a WAV, slower or faster by its
// length scale, the inverse of the speed.

/** Speaks `sentence` with the voice into the WAV file `wav`. */
export async function piperSentence(piper: Program, voice: string, sentence: string, wav: string, speed: number, signal: AbortSignal): Promise<void> {
  const spoken = await runProgram(piper, ['-m', voice, '-f', wav, '--length-scale', String(Math.round((1 / speed) * 1000) / 1000), '--', sentence], { signal });
  if (spoken.exitCode !== 0) {
    const reason = lastLines(spoken.output);
    throw kvvideoProblem('NARRATION_FAILED', `piper couldn't narrate: ${reason}`, { service: 'piper', reason });
  }
}
