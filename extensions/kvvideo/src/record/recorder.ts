import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { startPiped } from '../programs/piped-program.ts';
import { lastLines, type Program } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import { isOwnAddress } from './address.ts';
import { cursorScript } from './cursor-script.ts';
import { recordEncoderArgs } from './encoder-args.ts';
import { frameWriter } from './frame-writer.ts';
import { pausesAfter, runStep } from './run-step.ts';
import { startScreencast } from './screencast.ts';
import type { Step } from './steps.ts';

// One recording (plan 16 §16.5, ADR 0107, 25): a fresh browser context opens the page; once it has loaded, its
// screencast feeds ffmpeg. The page is shown 500 ms before the first step, 400 ms after each step but `wait` and
// `waitFor`, and 1000 ms after the last. Requests to kvman's own address are aborted (ADR 0107, 18).

export type RecordPlan = { url: string; steps: readonly Step[]; width: number; height: number; folder: string; ownPort: number | null; ffmpeg: Program; signal: AbortSignal; now(): number };

export type Recording = { video: string; durationMs: number; steps: { do: Step['do']; atMs: number }[] };

const firstLine = (error: unknown): string => (error instanceof Error ? (error.message.split('\n').find((line) => line.trim() !== '') ?? error.name) : String(error)).trim();

async function contextFor(browser: Browser, plan: RecordPlan): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: plan.width, height: plan.height }, deviceScaleFactor: 1 });
  await context.route((url) => isOwnAddress(url, plan.ownPort), (route) => route.abort('blockedbyclient'));
  await context.addInitScript(cursorScript);
  return context;
}

async function open(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  } catch (error) {
    throw kvvideoProblem('STEP_FAILED', `The page ${url} didn't load: ${firstLine(error)}`, { step: 0, reason: firstLine(error) });
  }
}

async function play(page: Page, plan: RecordPlan, startedAt: number): Promise<Recording['steps']> {
  await page.waitForTimeout(500);
  let pointer = { x: plan.width / 2, y: plan.height / 2 };
  await page.mouse.move(pointer.x, pointer.y);
  const done: Recording['steps'] = [];
  for (const [index, step] of plan.steps.entries()) {
    done.push({ do: step.do, atMs: Math.round(plan.now() - startedAt) });
    try {
      pointer = await runStep(page, step, pointer);
    } catch (error) {
      throw kvvideoProblem('STEP_FAILED', `Step ${String(index + 1)} (${step.do}) failed: ${firstLine(error)}`, { step: index + 1, reason: firstLine(error) });
    }
    if (pausesAfter(step)) await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1000);
  return done;
}

export async function record(browser: Browser, plan: RecordPlan): Promise<Recording> {
  const context = await contextFor(browser, plan);
  const page = await context.newPage();
  await open(page, plan.url);
  const video = path.join(plan.folder, 'recording.mp4');
  const stopEncoder = new AbortController();
  const encoder = await startPiped(plan.ffmpeg, recordEncoderArgs(plan.width, plan.height, video), AbortSignal.any([plan.signal, stopEncoder.signal]));
  try {
    const startedAt = plan.now();
    const writer = frameWriter((frame) => encoder.write(frame), startedAt);
    const screencast = await startScreencast(page, plan, (frame, atMs) => writer.frame(frame, atMs), plan.now);
    const steps = await play(page, plan, startedAt).finally(() => screencast.stop());
    const endedAt = plan.now();
    await writer.finish(endedAt);
    const run = await encoder.end();
    if (run.exitCode !== 0) throw kvvideoProblem('RENDER_FAILED', `ffmpeg couldn't encode the recording (exit ${String(run.exitCode)}).`, { reason: lastLines(run.output) });
    return { video, durationMs: Math.round(endedAt - startedAt), steps };
  } finally {
    stopEncoder.abort();
    await context.close();
  }
}
