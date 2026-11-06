import type { Browser } from 'playwright-core';
import { holdPageClock } from '../record/page-clock.ts';
import type { FailedLoad } from '../record/failed-loads.ts';
import { openSource, recordingContext, type RecordSource } from '../record/recorder.ts';
import type { SceneAssets } from '../record/scene-address.ts';

// The frames of `look` (plan 16 §16.5 Looking): the website or the page opened as `record` opens it, its clock held,
// and at each moment, in increasing order, every animation set to it and the page shot as a JPEG at its CSS size.

export type LookPlan = { source: RecordSource; width: number; height: number; device: 'desktop' | 'phone'; ownPort: number | null; assets: SceneAssets; moments: readonly number[] };

export type Looked = { frames: { atMs: number; image: Buffer }[]; failed: FailedLoad[] };

export async function lookAt(browser: Browser, plan: LookPlan): Promise<Looked> {
  const { context, failed } = await recordingContext(browser, plan);
  try {
    const page = await context.newPage();
    const clock = await holdPageClock(page);
    await openSource(page, plan.source);
    const frames = [];
    for (const atMs of [...plan.moments].sort((first, second) => first - second)) {
      await clock.seek(atMs);
      frames.push({ atMs, image: await page.screenshot({ type: 'jpeg', quality: 85, scale: 'css' }) });
    }
    return { frames, failed: failed() };
  } finally {
    await context.close();
  }
}
