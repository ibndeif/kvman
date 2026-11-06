import type { Browser } from 'playwright-core';
import { holdPageClock } from '../record/page-clock.ts';
import type { FailedLoad } from '../record/failed-loads.ts';
import { advanceClock, frameTimeMs, useClock } from '../record/drawn-page.ts';
import { openSource, recordingContext, type RecordSource } from '../record/recorder.ts';
import type { SceneAssets } from '../record/scene-address.ts';

// The frames of `look` (plan 16 §16.5 Looking; ADR 0120, 17): the website or the page opened as `record` opens it, its
// clock held. At each moment, in increasing order, a page's clock (kvvideo's) moves to it in frames of 1/60 s, so its
// scripts run as they would in its recording, and a website's animations are set to it; then the page is shot as a
// JPEG at its CSS size.

export type LookPlan = { source: RecordSource; width: number; height: number; device: 'desktop' | 'phone'; ownPort: number | null; assets: SceneAssets; moments: readonly number[] };

export type Looked = { frames: { atMs: number; image: Buffer }[]; failed: FailedLoad[] };

export async function lookAt(browser: Browser, plan: LookPlan): Promise<Looked> {
  const { context, failed } = await recordingContext(browser, plan);
  try {
    const page = await context.newPage();
    const onClock = plan.source.kind === 'page';
    if (onClock) await useClock(page);
    const clock = await holdPageClock(page);
    await openSource(page, plan.source);
    const frames = [];
    let frame = 0;
    for (const atMs of [...plan.moments].sort((first, second) => first - second)) {
      if (onClock) {
        for (; frameTimeMs(frame) < atMs; frame += 1) await advanceClock(page, frameTimeMs(frame));
        await advanceClock(page, atMs);
      } else {
        await clock.seek(atMs);
      }
      frames.push({ atMs, image: await page.screenshot({ type: 'jpeg', quality: 85, scale: 'css' }) });
    }
    return { frames, failed: failed() };
  } finally {
    await context.close();
  }
}
