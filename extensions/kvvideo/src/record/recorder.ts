import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { startPiped } from '../programs/piped-program.ts';
import { lastLines, type Program } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import { isOwnAddress } from './address.ts';
import { cursorScript } from './cursor-script.ts';
import { recordEncoderArgs } from './encoder-args.ts';
import { frameWriter } from './frame-writer.ts';
import { waitUntilMs, type Cues } from './narration-cues.ts';
import type { SoundCue } from './clock-script.ts';
import { drawFrames, isDrawn, useClock } from './drawn-page.ts';
import { failedLoads, watchLoads, type FailedLoad } from './failed-loads.ts';
import { answerPageRequest, pageAddress, pageOrigin } from './page-route.ts';
import type { SceneAssets } from './scene-address.ts';
import { holdPageClock } from './page-clock.ts';
import { waitUntilReady } from './page-ready.ts';
import { pausesAfter, runStep, type StepState } from './run-step.ts';
import { startScreencast } from './screencast.ts';
import type { Action, Step } from './steps.ts';

// One recording (plan 16 §16.5; ADR 0107, 25; ADR 0115, 8 and 32; ADR 0120, 2 and 13), a page of only waits drawn frame
// by frame, anything else in real time: a fresh browser context at 2× density opens the
// website or the page; once it is ready, its screencast feeds ffmpeg. The page is shown 500 ms before the first step,
// 400 ms after each step but `wait` and `waitFor`, and 1000 ms after the last, and lasts at least as long as its
// narration's cues ask; its animations wait for the recording's start (ADR 0117, 5). Requests to kvman's own address are
// aborted (ADR 0107, 18).

export type RecordSource = { kind: 'site'; url: string } | { kind: 'page'; file: string };

export type RecordPlan = {
  source: RecordSource;
  steps: readonly Step[];
  width: number;
  height: number;
  device: 'desktop' | 'phone';
  cues: Cues | undefined;
  folder: string;
  ownPort: number | null;
  assets: SceneAssets;
  ffmpeg: Program;
  signal: AbortSignal;
  now(): number;
  stepStarted(number: number, of: number): void;
  frameDrawn(number: number, of: number): void;
};

export type Recording = { video: string; durationMs: number; actions: Action[]; failed: FailedLoad[]; drawn: boolean; sounds: SoundCue[] };

const scale = 2;

const firstLine = (error: unknown): string => (error instanceof Error ? (error.message.split('\n').find((line) => line.trim() !== '') ?? error.name) : String(error)).trim();

export type RecordingContext = { context: BrowserContext; failed(): FailedLoad[] };

/** A fresh browser context for a recording: its size and device, kvman's port aborted, a page's files, the pointer, and its failed loads. */
export async function recordingContext(browser: Browser, plan: Pick<RecordPlan, 'source' | 'width' | 'height' | 'device' | 'ownPort' | 'assets'>): Promise<RecordingContext> {
  const phone = plan.device === 'phone';
  const context = await browser.newContext({ viewport: { width: plan.width, height: plan.height }, deviceScaleFactor: scale, isMobile: phone, hasTouch: phone });
  await context.route((url) => isOwnAddress(url, plan.ownPort), (route) => route.abort('blockedbyclient'));
  const { source } = plan;
  if (source.kind === 'page') {
    await context.route(`${pageOrigin}/**`, async (route) => {
      const answer = answerPageRequest(path.dirname(source.file), route.request().url(), plan.assets);
      if (answer.status === 404) await route.fulfill({ status: 404, body: '' });
      else if ('body' in answer) await route.fulfill({ status: 200, body: answer.body, contentType: answer.contentType });
      else await route.fulfill({ status: 200, path: answer.file, contentType: answer.contentType });
    });
  }
  await context.addInitScript(cursorScript(plan.device));
  const loads = failedLoads(plan.ownPort);
  watchLoads(context, loads);
  return { context, failed: () => loads.list() };
}

/** Opens the website or the page and waits until it is ready, or fails `kvvideo/STEP_FAILED` with step 0. */
export async function openSource(page: Page, source: RecordSource): Promise<void> {
  const address = source.kind === 'site' ? source.url : pageAddress(source.file);
  try {
    await page.goto(address, { waitUntil: 'load', timeout: 30_000 });
    await waitUntilReady(page);
  } catch (error) {
    throw kvvideoProblem('STEP_FAILED', `The page ${address} didn't load: ${firstLine(error)}`, { step: 0, reason: firstLine(error) });
  }
}

async function waitForCue(page: Page, plan: RecordPlan, step: Step, elapsed: () => number): Promise<void> {
  if (step.do === 'wait' || step.atLine === undefined || plan.cues === undefined) return;
  const wait = waitUntilMs(plan.cues.lineStartsMs[step.atLine - 1] ?? 0, elapsed());
  if (wait > 0) await page.waitForTimeout(wait);
}

async function play(page: Page, plan: RecordPlan, startedAt: number): Promise<Action[]> {
  const elapsed = (): number => Math.round(plan.now() - startedAt);
  await page.waitForTimeout(500);
  const state: StepState = { page, device: plan.device, pointer: { x: plan.width / 2, y: plan.height / 2 }, elapsed };
  const actions: Action[] = [];
  for (const [index, step] of plan.steps.entries()) {
    plan.stepStarted(index + 1, plan.steps.length);
    await waitForCue(page, plan, step, elapsed);
    const atMs = elapsed();
    try {
      const result = await runStep(state, step);
      state.pointer = result.pointer;
      actions.push({ do: step.do, atMs, endMs: elapsed(), ...(result.act === undefined ? {} : { actMs: result.act.atMs, box: result.act.box }) });
    } catch (error) {
      throw kvvideoProblem('STEP_FAILED', `Step ${String(index + 1)} (${step.do}) failed: ${firstLine(error)}`, { step: index + 1, reason: firstLine(error) });
    }
    if (pausesAfter(step)) await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1000);
  const rest = plan.cues === undefined ? 0 : waitUntilMs(plan.cues.leastLengthMs, elapsed());
  if (rest > 0) await page.waitForTimeout(rest);
  return actions;
}

/** A page drawn frame by frame on kvvideo's clock (ADR 0120, 2 and 13). */
async function draw(browser: Browser, plan: RecordPlan): Promise<Recording> {
  const { context, failed } = await recordingContext(browser, plan);
  try {
    const page = await context.newPage();
    await useClock(page);
    await holdPageClock(page);
    await openSource(page, plan.source);
    const drawn = await drawFrames(page, { steps: plan.steps, cues: plan.cues, width: plan.width, height: plan.height, folder: plan.folder, ffmpeg: plan.ffmpeg, signal: plan.signal, frameDrawn: plan.frameDrawn });
    return { ...drawn, failed: failed(), drawn: true };
  } finally {
    await context.close();
  }
}

export async function record(browser: Browser, plan: RecordPlan): Promise<Recording> {
  if (isDrawn(plan.source, plan.steps)) return draw(browser, plan);
  const { context, failed } = await recordingContext(browser, plan);
  const page = await context.newPage();
  const clock = await holdPageClock(page);
  await openSource(page, plan.source);
  const size = { width: plan.width * scale, height: plan.height * scale };
  const video = path.join(plan.folder, 'recording.mp4');
  const stopEncoder = new AbortController();
  const encoder = await startPiped(plan.ffmpeg, recordEncoderArgs(size.width, size.height, video), AbortSignal.any([plan.signal, stopEncoder.signal]));
  try {
    const startedAt = plan.now();
    await clock.start();
    const writer = frameWriter((frame) => encoder.write(frame), startedAt);
    const screencast = await startScreencast(page, size, (frame, atMs) => writer.frame(frame, atMs), plan.now);
    const actions = await play(page, plan, startedAt).finally(() => screencast.stop());
    const endedAt = plan.now();
    await writer.finish(endedAt);
    const run = await encoder.end();
    if (run.exitCode !== 0) throw kvvideoProblem('RENDER_FAILED', `ffmpeg couldn't encode the recording (exit ${String(run.exitCode)}).`, { reason: lastLines(run.output) });
    return { video, durationMs: Math.round(endedAt - startedAt), actions, failed: failed(), drawn: false, sounds: [] };
  } finally {
    stopEncoder.abort();
    await context.close();
  }
}
