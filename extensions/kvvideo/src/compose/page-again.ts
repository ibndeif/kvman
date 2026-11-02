import { copyFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import { placeOutput, workFolder } from '../files/place-output.ts';
import { readSidecar, sidecarPath, writeSidecar } from '../files/sidecar.ts';
import { cuesOf } from '../record/narration-cues.ts';
import { record } from '../record/recorder.ts';
import type { Program } from '../programs/run-program.ts';
import type { Size } from './frame-layout.ts';
import type { Recording } from './scene-look.ts';

// A recorded page at another shape (plan 16 §16.8; ADR 0115, 44): an HTML scene is laid out for its shape, so for a
// size of another shape it is recorded again, with the same steps, at that shape with its shorter side 720 CSS
// pixels, into the size's folder, its sidecar beside it.

const shorterSide = 720;

/** Whether a recording's shape differs from the size's by more than 1%. */
export function otherShape(recording: Recording, size: Size): boolean {
  const recorded = recording.width / recording.height;
  const wanted = size.width / size.height;
  return Math.abs(recorded - wanted) / wanted > 0.01;
}

/** The CSS size of a page recorded again for `size`: its shorter side 720, its sides even. */
export function pageSizeFor(size: Size): Size {
  const even = (value: number): number => 2 * Math.round(value / 2);
  return size.width >= size.height ? { width: even((shorterSide * size.width) / size.height), height: shorterSide } : { width: shorterSide, height: even((shorterSide * size.height) / size.width) };
}

export type PageAgain = { root: string; folder: string; number: number; recording: Recording; narration: string | undefined; size: Size; browser: Browser; ffmpeg: Program; ownPort: number | null; signal: AbortSignal };

/** Records the page again and answers the new clip's path, with its sidecar beside it. */
export async function recordPageAgain(again: PageAgain): Promise<string> {
  const page = pageSizeFor(again.size);
  const narration = again.narration === undefined ? undefined : readSidecar(again.narration);
  const cues = narration?.kind === 'narration' ? cuesOf(narration) : undefined;
  const work = workFolder();
  try {
    const plan = { source: { kind: 'page' as const, file: path.resolve(again.root, again.recording.source) }, steps: again.recording.steps, ...page, device: 'desktop' as const, cues, folder: work.folder, ownPort: again.ownPort, ffmpeg: again.ffmpeg, signal: again.signal, now: () => performance.now(), stepStarted: () => undefined };
    const recording = await record(again.browser, plan);
    mkdirSync(again.folder, { recursive: true });
    const clip = path.join(again.folder, `page-${String(again.number)}.mp4`);
    copyFileSync(recording.video, clip);
    placeOutput(writeSidecar(work.folder, { ...again.recording, ...page, durationMs: recording.durationMs, actions: recording.actions }), sidecarPath(clip));
    return clip;
  } finally {
    work.remove();
  }
}
