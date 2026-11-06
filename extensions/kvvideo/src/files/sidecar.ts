import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import { actionSchema, soundCueSchema, stepSchema } from '../record/steps.ts';

// The sidecar beside an output, `<file>.kvvideo.json` (plan 16 §16.3; ADR 0115, 31): what a later command needs from
// it, so the agent copies no numbers between calls. It is validated when read; a missing or invalid one is absent.

const wordSchema = z.object({ text: z.string(), startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative() });

export const sidecarCaptionSchema = z.object({ text: z.string(), startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative(), words: z.array(wordSchema).exactOptional() });

export const recordingSidecarSchema = z.object({
  kind: z.enum(['site', 'page']),
  source: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  device: z.enum(['desktop', 'phone']),
  scale: z.literal(2),
  durationMs: z.number().int().nonnegative(),
  steps: z.array(stepSchema),
  actions: z.array(actionSchema),
  // Written since ADR 0120; a sidecar from before reads as recorded in real time, with no cues.
  drawn: z.boolean().default(false),
  sounds: z.array(soundCueSchema).default([]),
});

export const narrationSidecarSchema = z.object({ kind: z.literal('narration'), durationMs: z.number().int().nonnegative(), captions: z.array(sidecarCaptionSchema) });

export const videoSidecarSchema = z.object({
  kind: z.literal('video'),
  durationMs: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  scenes: z.array(z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative() })),
  captions: z.array(sidecarCaptionSchema),
});

const sidecarSchema = z.discriminatedUnion('kind', [recordingSidecarSchema, narrationSidecarSchema, videoSidecarSchema]);

/** What a sidecar holds. */
export type Sidecar = z.output<typeof sidecarSchema>;

/** The sidecar's path beside a file. */
export function sidecarPath(file: string): string {
  return `${file}.kvvideo.json`;
}

/** The sidecar beside an output; an existing one is replaced only with `replace` (plan 16 §16.3). */
export function sidecarOutputPath(output: string, replace: boolean, shown: string): string {
  const beside = sidecarPath(output);
  if (existsSync(beside) && !replace) throw invalid(`${sidecarPath(shown)} exists; set replace to true to write over it.`, { path: sidecarPath(shown) });
  return beside;
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/** The sidecar beside `file`, or `undefined` when it is missing or invalid. */
export function readSidecar(file: string): Sidecar | undefined {
  const beside = sidecarPath(file);
  if (!existsSync(beside)) return undefined;
  const result = sidecarSchema.safeParse(parsed(readFileSync(beside, 'utf8')));
  return result.success ? result.data : undefined;
}

/** Writes a sidecar into a work folder, to be placed beside its output; answers its path there. */
export function writeSidecar(folder: string, sidecar: Sidecar): string {
  const made = path.join(folder, 'sidecar.json');
  writeFileSync(made, `${JSON.stringify(sidecar, null, 2)}\n`);
  return made;
}
