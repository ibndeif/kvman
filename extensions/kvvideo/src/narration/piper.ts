import path from 'node:path';
import { lastLines, runProgram, type Program } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';

// Piper on this computer (plan 16 §16.6, ADR 0107, 22): it writes a WAV, which ffmpeg turns into the MP3.

export type PiperPrograms = { piper: Program; ffmpeg: Program };

function failed(reason: string): Error {
  return kvvideoProblem('NARRATION_FAILED', `piper couldn't narrate: ${reason}`, { service: 'piper', reason });
}

/** Narrates `text` with the voice into `<folder>/narration.mp3`, and answers that file. */
export async function piperNarration(programs: PiperPrograms, voice: string, text: string, folder: string, signal: AbortSignal): Promise<string> {
  const wav = path.join(folder, 'narration.wav');
  const mp3 = path.join(folder, 'narration.mp3');
  const spoken = await runProgram(programs.piper, ['-m', voice, '-f', wav, '--', text], { signal });
  if (spoken.exitCode !== 0) throw failed(lastLines(spoken.output));
  const encoded = await runProgram(programs.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', '-y', mp3], { signal });
  if (encoded.exitCode !== 0) throw failed(lastLines(encoded.output));
  return mp3;
}
