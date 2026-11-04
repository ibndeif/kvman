import type { Page } from 'playwright-core';

// A page's clock (plan 16 §16.5; ADR 0117, 5): its document's animations, CSS animations and transitions included, are
// held at their start from before it loads, by the browser's animation playback rate, so a page's time 0 is when the
// recording starts, however long the wait for its fonts and network took. `look` keeps them held and sets every
// animation to each moment, so a frame is the same at every call.

export type PageClock = { start(): Promise<void>; seek(ms: number): Promise<void> };

export async function holdPageClock(page: Page): Promise<PageClock> {
  const session = await page.context().newCDPSession(page);
  await session.send('Animation.setPlaybackRate', { playbackRate: 0 });
  return {
    start: async () => {
      await session.send('Animation.setPlaybackRate', { playbackRate: 1 });
    },
    seek: async (ms) => {
      await page.evaluate(`for (const animation of document.getAnimations()) animation.currentTime = ${String(ms)};`);
    },
  };
}
