import path from 'node:path';
import type { Page } from 'playwright-core';
import { z } from '@kvman/sdk';
import { startPiped } from '../programs/piped-program.ts';
import { lastLines } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import { clockScript, type SoundCue } from './clock-script.ts';
import { recordEncoderArgs } from './encoder-args.ts';
import type { Cues } from './narration-cues.ts';
import type { RecordSource } from './recorder.ts';
import type { Action, Step } from './steps.ts';

// A page drawn frame by frame (plan 16 §16.5; ADR 0120, 2, 13 to 15, and 21): a page whose steps are all `wait` is not
// recorded in real time. kvvideo's clock is set to each frame's time, 60 a second, the page is shot at its 2× density,
// and the frames are piped to ffmpeg; so every frame is exact, whatever the computer's load. Its length is what the
// real-time rules give, and its sound cues are gathered as it is drawn.

export const drawnFramesPerSecond = 60;

const beforeMs = 500;
const afterMs = 1000;
const progressEvery = 30;

/** Whether a recording is drawn frame by frame: a page whose steps are all `wait`. */
export function isDrawn(source: RecordSource, steps: readonly Step[]): boolean {
  return source.kind === 'page' && steps.every((step) => step.do === 'wait');
}

/** A drawn page's length: 500 ms, its waits, and 1000 ms, at least as long as its narration asks. */
export function drawnLengthMs(steps: readonly Step[], cues: Cues | undefined): number {
  const waits = steps.reduce((sum, step) => sum + (step.do === 'wait' ? step.ms : 0), 0);
  return Math.max(beforeMs + waits + afterMs, cues?.leastLengthMs ?? 0);
}

/** The frames a drawn page of `lengthMs` has: each whose time is before the length. */
export function drawnFrameCount(lengthMs: number): number {
  return Math.ceil((lengthMs * drawnFramesPerSecond) / 1000);
}

/** The time of frame `n`, in ms from the clock's start. */
export const frameTimeMs = (n: number): number => (n * 1000) / drawnFramesPerSecond;

// Each wait step's times, as a real-time recording would answer them.
function waitActions(steps: readonly Step[]): Action[] {
  let atMs = beforeMs;
  return steps.map((step) => {
    const ms = step.do === 'wait' ? step.ms : 0;
    const action = { do: step.do, atMs, endMs: atMs + ms };
    atMs += ms;
    return action;
  });
}

const cueSchema = z.array(z.object({ sound: z.enum(['pop', 'whoosh', 'click']), atMs: z.number().int().nonnegative() }));

/** Sets the page's clock to `atMs` and answers the sound cues that started. */
export async function advanceClock(page: Page, atMs: number): Promise<SoundCue[]> {
  return cueSchema.parse(await page.evaluate(`window.__kvvideoClock.advance(${String(atMs)})`));
}

/** Gives kvvideo's clock to every page the context opens, before its own scripts. */
export async function useClock(page: Page): Promise<void> {
  await page.addInitScript(clockScript);
}

export type DrawPlan = { steps: readonly Step[]; cues: Cues | undefined; width: number; height: number; folder: string; ffmpeg: Parameters<typeof startPiped>[0]; signal: AbortSignal; frameDrawn(n: number, of: number): void };

export type Drawn = { video: string; durationMs: number; actions: Action[]; sounds: SoundCue[] };

const screenshotSchema = z.object({ data: z.string() });

/** Draws an opened page, its clock already kvvideo's, frame by frame into `<folder>/recording.mp4`. */
export async function drawFrames(page: Page, plan: DrawPlan): Promise<Drawn> {
  const frames = drawnFrameCount(drawnLengthMs(plan.steps, plan.cues));
  const video = path.join(plan.folder, 'recording.mp4');
  const stopEncoder = new AbortController();
  const encoder = await startPiped(plan.ffmpeg, recordEncoderArgs(plan.width * 2, plan.height * 2, video, drawnFramesPerSecond), AbortSignal.any([plan.signal, stopEncoder.signal]));
  const session = await page.context().newCDPSession(page);
  try {
    const sounds: SoundCue[] = [];
    for (let n = 0; n < frames; n += 1) {
      sounds.push(...(await advanceClock(page, frameTimeMs(n))));
      const shot = screenshotSchema.parse(await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 }));
      await encoder.write(Buffer.from(shot.data, 'base64'));
      if ((n + 1) % progressEvery === 0 || n + 1 === frames) plan.frameDrawn(n + 1, frames);
    }
    const run = await encoder.end();
    if (run.exitCode !== 0) throw kvvideoProblem('RENDER_FAILED', `ffmpeg couldn't encode the drawn page (exit ${String(run.exitCode)}).`, { reason: lastLines(run.output) });
    return { video, durationMs: Math.round(frameTimeMs(frames)), actions: waitActions(plan.steps), sounds };
  } finally {
    stopEncoder.abort();
    await session.detach();
  }
}
