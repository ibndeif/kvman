import { z } from '@kvman/sdk';
import { kvvideoProblem } from '../problems.ts';

// ElevenLabs's character times (plan 16 §16.6; ADR 0115, 17): each character of the text it was sent, by code point,
// with when it starts and ends, kept in whole milliseconds.

export const alignmentSchema = z.object({ startsMs: z.array(z.number().int().nonnegative()), endsMs: z.array(z.number().int().nonnegative()) });

/** When each spoken character starts and ends, in ms from the sentence's start. */
export type Alignment = z.output<typeof alignmentSchema>;

export const elevenLabsAlignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});

const ms = (seconds: number): number => Math.max(0, Math.round(seconds * 1000));

/** The alignment of `spoken`; one whose characters aren't the text fails `kvvideo/NARRATION_FAILED`. */
export function alignmentOf(answer: z.output<typeof elevenLabsAlignmentSchema>, spoken: string): Alignment {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = answer;
  if (characters.join('') !== spoken || [...spoken].length !== characters.length || starts.length !== characters.length || ends.length !== characters.length) {
    const reason = "ElevenLabs's character times don't match the text it was sent";
    throw kvvideoProblem('NARRATION_FAILED', reason, { service: 'elevenlabs', reason });
  }
  return { startsMs: starts.map(ms), endsMs: ends.map(ms) };
}
